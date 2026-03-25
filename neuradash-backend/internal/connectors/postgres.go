package connectors

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	// PostgreSQL driver — used by Supabase, Neon, RDS, Cloud SQL, CockroachDB, etc.
	_ "github.com/jackc/pgx/v5/stdlib"
)

// postgresConnector implements DBConnector for PostgreSQL-family databases.
// Works with: Supabase, Neon, Railway, Render, aws rds, Google Cloud SQL,
// CockroachDB, TimescaleDB, AlloyDB, Heroku Postgres.
type postgresConnector struct {
	db   *sql.DB
	opts ConnectOptions
}

// newPostgresConnector opens a PostgreSQL connection pool.
func newPostgresConnector(opts ConnectOptions) (*postgresConnector, error) {
	dsn := buildPostgresDSN(opts)
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, fmt.Errorf("postgres: open failed: %w", err)
	}
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(2)
	db.SetConnMaxLifetime(10 * time.Minute)
	return &postgresConnector{db: db, opts: opts}, nil
}

// Ping tests connectivity.
func (c *postgresConnector) Ping(ctx context.Context) (int64, error) {
	start := time.Now()
	if err := c.db.PingContext(ctx); err != nil {
		return 0, fmt.Errorf("postgres ping failed: %w", err)
	}
	return time.Since(start).Milliseconds(), nil
}

// DriverName returns the driver identifier.
func (c *postgresConnector) DriverName() string { return "pgx" }

// IntrospectSchema returns tables + columns from information_schema.
func (c *postgresConnector) IntrospectSchema(ctx context.Context, schema string) ([]TableMeta, error) {
	if schema == "" {
		schema = "public"
	}

	// 1. Get tables + views
	tableRows, err := c.db.QueryContext(ctx, `
		SELECT
			table_schema,
			table_name,
			table_type,
			COALESCE(pg_class.reltuples::bigint, 0) AS row_estimate
		FROM information_schema.tables t
		LEFT JOIN pg_class ON pg_class.relname = t.table_name
		LEFT JOIN pg_namespace ON pg_namespace.nspname = t.table_schema
			AND pg_namespace.oid = pg_class.relnamespace
		WHERE t.table_schema = $1
		  AND t.table_type IN ('BASE TABLE', 'VIEW')
		ORDER BY t.table_name`, schema)
	if err != nil {
		return nil, fmt.Errorf("postgres: table query failed: %w", err)
	}
	defer tableRows.Close()

	var tables []TableMeta
	tableIndex := map[string]int{}
	for tableRows.Next() {
		var tbl TableMeta
		var tblType string
		if err := tableRows.Scan(&tbl.Schema, &tbl.Name, &tblType, &tbl.RowEst); err != nil {
			continue
		}
		tbl.Type = strings.Replace(tblType, "BASE ", "", 1)
		tableIndex[tbl.Name] = len(tables)
		tables = append(tables, tbl)
	}

	if len(tables) == 0 {
		return tables, nil
	}

	// 2. Get columns for all tables
	colRows, err := c.db.QueryContext(ctx, `
		SELECT
			c.table_name,
			c.column_name,
			c.data_type,
			c.is_nullable,
			c.character_maximum_length,
			c.column_default,
			CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS is_primary,
			CASE WHEN uc.column_name IS NOT NULL THEN true ELSE false END AS is_unique
		FROM information_schema.columns c
		LEFT JOIN (
			SELECT ku.table_name, ku.column_name
			FROM information_schema.table_constraints tc
			JOIN information_schema.key_column_usage ku
			ON tc.constraint_name = ku.constraint_name AND tc.table_schema = ku.table_schema
			WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = $1
		) pk ON pk.table_name = c.table_name AND pk.column_name = c.column_name
		LEFT JOIN (
			SELECT ku.table_name, ku.column_name
			FROM information_schema.table_constraints tc
			JOIN information_schema.key_column_usage ku
			ON tc.constraint_name = ku.constraint_name AND tc.table_schema = ku.table_schema
			WHERE tc.constraint_type = 'UNIQUE' AND tc.table_schema = $1
		) uc ON uc.table_name = c.table_name AND uc.column_name = c.column_name
		WHERE c.table_schema = $1
		ORDER BY c.table_name, c.ordinal_position`, schema)
	if err != nil {
		return nil, fmt.Errorf("postgres: column query failed: %w", err)
	}
	defer colRows.Close()

	for colRows.Next() {
		var tableName, colName, dataType, isNullable string
		var maxLen *int
		var colDefault *string
		var isPrimary, isUnique bool
		if err := colRows.Scan(&tableName, &colName, &dataType, &isNullable, &maxLen, &colDefault, &isPrimary, &isUnique); err != nil {
			continue
		}
		col := ColumnMeta{
			Name:      colName,
			DataType:  dataType,
			Nullable:  isNullable == "YES",
			IsPrimary: isPrimary,
			IsUnique:  isUnique,
			MaxLength: maxLen,
			Default:   colDefault,
		}
		if idx, ok := tableIndex[tableName]; ok {
			tables[idx].Columns = append(tables[idx].Columns, col)
		}
	}

	return tables, nil
}

// Query executes a SELECT query and returns results.
func (c *postgresConnector) Query(ctx context.Context, query string, limit int) (*QueryResult, error) {
	return execQuery(ctx, c.db, query, limit)
}

// Close closes the connection pool.
func (c *postgresConnector) Close() error { return c.db.Close() }

// buildPostgresDSN builds a pgx DSN string.
// Supabase example: host=db.xxx.supabase.co port=5432 user=postgres password=xxx dbname=postgres sslmode=require
func buildPostgresDSN(opts ConnectOptions) string {
	ssl := opts.SSLMode
	if ssl == "" {
		// Supabase, Neon, cloud providers require SSL
		if strings.Contains(opts.Host, "supabase") ||
			strings.Contains(opts.Host, "neon.tech") ||
			strings.Contains(opts.Host, "amazonaws") ||
			strings.Contains(opts.Host, "cloudsql") {
			ssl = "require"
		} else {
			ssl = "prefer"
		}
	}
	port := opts.Port
	if port == 0 {
		port = 5432
	}
	return fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s connect_timeout=10",
		opts.Host, port, opts.Username, opts.Password, opts.DatabaseName, ssl,
	)
}

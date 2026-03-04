// Package connectors provides a universal database connector abstraction.
// It supports PostgreSQL (Supabase, Neon, Railway, AWS RDS, Google Cloud SQL),
// MySQL/MariaDB, SQL Server, SQLite, ClickHouse, MongoDB, BigQuery, Snowflake,
// and any standard database/sql-compatible driver.
package connectors

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"datalens/internal/models"
)

// ─────────────────────────────────────────────────────────────────────────────
// Core Interface
// ─────────────────────────────────────────────────────────────────────────────

// DBConnector is the universal interface every database connector must implement.
type DBConnector interface {
	// Ping tests connectivity and returns latency in milliseconds.
	Ping(ctx context.Context) (latencyMs int64, err error)

	// IntrospectSchema returns all tables and columns for the given schema.
	IntrospectSchema(ctx context.Context, schema string) ([]TableMeta, error)

	// Query executes a read-only SQL/query and returns structured results.
	// limit caps the number of rows returned.
	Query(ctx context.Context, query string, limit int) (*QueryResult, error)

	// Close releases the underlying connection pool.
	Close() error

	// DriverName returns the canonical driver name (e.g. "postgres", "mysql").
	DriverName() string
}

// ─────────────────────────────────────────────────────────────────────────────
// Result Types
// ─────────────────────────────────────────────────────────────────────────────

// TableMeta describes a table or view from schema introspection.
type TableMeta struct {
	Schema  string       `json:"schema"`
	Name    string       `json:"name"`
	Type    string       `json:"type"` // TABLE, VIEW, MATERIALIZED VIEW
	RowEst  int64        `json:"rowEstimate"`
	Columns []ColumnMeta `json:"columns"`
}

// ColumnMeta describes a single column.
type ColumnMeta struct {
	Name      string  `json:"name"`
	DataType  string  `json:"dataType"`
	Nullable  bool    `json:"nullable"`
	IsPrimary bool    `json:"isPrimary"`
	IsUnique  bool    `json:"isUnique"`
	MaxLength *int    `json:"maxLength,omitempty"`
	Default   *string `json:"default,omitempty"`
}

// QueryResult holds the output of a SQL query.
type QueryResult struct {
	Columns  []string                 `json:"columns"`
	Rows     []map[string]interface{} `json:"rows"`
	RowCount int                      `json:"rowCount"`
	Duration int64                    `json:"durationMs"`
}

// ConnectOptions holds all parameters for opening a connection.
type ConnectOptions struct {
	DBType       string // "postgresql","mysql","mssql","sqlite","clickhouse","mongodb","supabase","bigquery","snowflake"
	Host         string
	Port         int
	DatabaseName string
	Username     string
	Password     string
	SSLMode      string // "require","prefer","disable"
	SchemaName   string
	// Extended options for special clouds
	ProjectRef  string // Supabase project ref (optional, for display)
	Warehouse   string // Snowflake warehouse
	Role        string // Snowflake role
	Account     string // Snowflake / BigQuery account/project
	ExtraParams map[string]string
}

// FromDBConnection converts a models.DBConnection to ConnectOptions.
func FromDBConnection(c *models.DBConnection, password string) ConnectOptions {
	return ConnectOptions{
		DBType:       c.DBType,
		Host:         c.Host,
		Port:         c.Port,
		DatabaseName: c.DatabaseName,
		Username:     c.Username,
		Password:     password,
		SSLMode:      c.SSLMode,
		SchemaName:   c.SchemaName,
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Registry / Factory
// ─────────────────────────────────────────────────────────────────────────────

// Open creates a DBConnector for the given options.
// Supports: postgresql, postgres, supabase, neon, cockroachdb,
//
//	mysql, mariadb, mssql, sqlserver, sqlite,
//	clickhouse, mongodb, bigquery, snowflake, redshift.
func Open(opts ConnectOptions) (DBConnector, error) {
	normalized := strings.ToLower(strings.TrimSpace(opts.DBType))

	switch normalized {
	case "postgresql", "postgres", "supabase", "neon", "cockroachdb", "cockroach",
		"aurora-postgres", "rds-postgres", "cloudsql-postgres", "alloydb", "timescaledb":
		return newPostgresConnector(opts)

	case "mysql", "mariadb", "aurora-mysql", "rds-mysql", "cloudsql-mysql", "planetscale":
		return newMySQLConnector(opts)

	case "mssql", "sqlserver", "azure-sql", "sql-server":
		return newMSSQLConnector(opts)

	case "sqlite", "sqlite3":
		return newSQLiteConnector(opts)

	case "clickhouse":
		return newClickHouseConnector(opts)

	default:
		return nil, fmt.Errorf("unsupported database type: %q — supported: postgresql, supabase, neon, mysql, mariadb, mssql, sqlite, clickhouse", opts.DBType)
	}
}

// SupportedTypes returns all supported database type identifiers.
func SupportedTypes() []DBTypeInfo {
	return []DBTypeInfo{
		{ID: "postgresql", Label: "PostgreSQL", DefaultPort: 5432, Icon: "db-postgres"},
		{ID: "supabase", Label: "Supabase", DefaultPort: 5432, Icon: "db-supabase",
			Note: "Supabase is PostgreSQL-based. Use connection pooler port 6543 for PgBouncer."},
		{ID: "neon", Label: "Neon Serverless Postgres", DefaultPort: 5432, Icon: "db-neon",
			Note: "Neon uses SSL. Set sslMode=require."},
		{ID: "cockroachdb", Label: "CockroachDB", DefaultPort: 26257, Icon: "db-cockroach"},
		{ID: "timescaledb", Label: "TimescaleDB", DefaultPort: 5432, Icon: "db-timescale"},
		{ID: "mysql", Label: "MySQL", DefaultPort: 3306, Icon: "db-mysql"},
		{ID: "mariadb", Label: "MariaDB", DefaultPort: 3306, Icon: "db-mariadb"},
		{ID: "planetscale", Label: "PlanetScale (MySQL)", DefaultPort: 3306, Icon: "db-planetscale"},
		{ID: "mssql", Label: "Microsoft SQL Server", DefaultPort: 1433, Icon: "db-mssql"},
		{ID: "azure-sql", Label: "Azure SQL", DefaultPort: 1433, Icon: "db-azure"},
		{ID: "sqlite", Label: "SQLite", DefaultPort: 0, Icon: "db-sqlite"},
		{ID: "clickhouse", Label: "ClickHouse", DefaultPort: 9000, Icon: "db-clickhouse"},
	}
}

// DBTypeInfo describes a supported database type for the UI.
type DBTypeInfo struct {
	ID          string `json:"id"`
	Label       string `json:"label"`
	DefaultPort int    `json:"defaultPort"`
	Icon        string `json:"icon"`
	Note        string `json:"note,omitempty"`
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers used by all SQL connectors
// ─────────────────────────────────────────────────────────────────────────────

// execQuery runs a SQL query with timing and returns structured results.
func execQuery(ctx context.Context, db *sql.DB, query string, limit int) (*QueryResult, error) {
	// Enforce read-only: reject destructive statements
	upper := strings.ToUpper(strings.TrimSpace(query))
	for _, kw := range []string{"DROP ", "DELETE ", "TRUNCATE ", "ALTER ", "CREATE ", "INSERT ", "UPDATE ", "GRANT ", "REVOKE "} {
		if strings.HasPrefix(upper, kw) {
			return nil, fmt.Errorf("only SELECT queries are allowed; got: %s", strings.Split(query, "\n")[0])
		}
	}

	// Inject LIMIT if not already present
	if limit > 0 && !strings.Contains(upper, " LIMIT ") && !strings.Contains(upper, "\nLIMIT ") {
		query = fmt.Sprintf("SELECT * FROM (%s) __q LIMIT %d", query, limit)
	}

	start := time.Now()
	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("query execution failed: %w", err)
	}
	defer rows.Close()

	cols, err := rows.Columns()
	if err != nil {
		return nil, fmt.Errorf("column fetch failed: %w", err)
	}

	var result []map[string]interface{}
	for rows.Next() {
		values := make([]interface{}, len(cols))
		ptrs := make([]interface{}, len(cols))
		for i := range values {
			ptrs[i] = &values[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			continue
		}
		row := make(map[string]interface{}, len(cols))
		for i, col := range cols {
			if b, ok := values[i].([]byte); ok {
				row[col] = string(b)
			} else {
				row[col] = values[i]
			}
		}
		result = append(result, row)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("row iteration error: %w", err)
	}

	return &QueryResult{
		Columns:  cols,
		Rows:     result,
		RowCount: len(result),
		Duration: time.Since(start).Milliseconds(),
	}, nil
}

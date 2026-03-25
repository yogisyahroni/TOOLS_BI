package connectors

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	// ClickHouse HTTP driver via standard database/sql
	// Using clickhouse-go driver which registers "clickhouse"
	_ "github.com/ClickHouse/clickhouse-go/v2"
)

// clickhouseConnector implements DBConnector for ClickHouse.
// Works with: ClickHouse Cloud, self-hosted ClickHouse.
type clickhouseConnector struct {
	db   *sql.DB
	opts ConnectOptions
}

func newClickHouseConnector(opts ConnectOptions) (*clickhouseConnector, error) {
	dsn := buildClickHouseDSN(opts)
	db, err := sql.Open("clickhouse", dsn)
	if err != nil {
		return nil, fmt.Errorf("clickhouse: open failed: %w", err)
	}
	db.SetMaxOpenConns(5)
	db.SetMaxIdleConns(2)
	db.SetConnMaxLifetime(10 * time.Minute)
	return &clickhouseConnector{db: db, opts: opts}, nil
}

func (c *clickhouseConnector) Ping(ctx context.Context) (int64, error) {
	start := time.Now()
	if err := c.db.PingContext(ctx); err != nil {
		return 0, fmt.Errorf("clickhouse ping failed: %w", err)
	}
	return time.Since(start).Milliseconds(), nil
}

func (c *clickhouseConnector) DriverName() string { return "clickhouse" }
func (c *clickhouseConnector) Close() error       { return c.db.Close() }

func (c *clickhouseConnector) IntrospectSchema(ctx context.Context, schema string) ([]TableMeta, error) {
	if schema == "" {
		schema = c.opts.DatabaseName
		if schema == "" {
			schema = "default"
		}
	}

	tableRows, err := c.db.QueryContext(ctx, `
		SELECT database, name, engine, total_rows
		FROM system.tables
		WHERE database = ?
		ORDER BY name`, schema)
	if err != nil {
		return nil, fmt.Errorf("clickhouse: table query failed: %w", err)
	}
	defer tableRows.Close()

	var tables []TableMeta
	tableIndex := map[string]int{}
	for tableRows.Next() {
		var tbl TableMeta
		var engine string
		var rowCount uint64
		if err := tableRows.Scan(&tbl.Schema, &tbl.Name, &engine, &rowCount); err != nil {
			continue
		}
		tbl.Type = "TABLE"
		tbl.RowEst = int64(rowCount)
		tableIndex[tbl.Name] = len(tables)
		tables = append(tables, tbl)
	}

	// Get columns from system.columns
	colRows, err := c.db.QueryContext(ctx, `
		SELECT table, name, type, default_expression, is_in_primary_key
		FROM system.columns
		WHERE database = ?
		ORDER BY table, position`, schema)
	if err != nil {
		return nil, fmt.Errorf("clickhouse: column query failed: %w", err)
	}
	defer colRows.Close()

	for colRows.Next() {
		var tableName, colName, dataType, defaultExpr string
		var isPrimary uint8
		if err := colRows.Scan(&tableName, &colName, &dataType, &defaultExpr, &isPrimary); err != nil {
			continue
		}
		var def *string
		if defaultExpr != "" {
			d := defaultExpr
			def = &d
		}
		col := ColumnMeta{
			Name:      colName,
			DataType:  dataType,
			Nullable:  strings.HasPrefix(dataType, "Nullable"),
			IsPrimary: isPrimary == 1,
			Default:   def,
		}
		if idx, ok := tableIndex[tableName]; ok {
			tables[idx].Columns = append(tables[idx].Columns, col)
		}
	}
	return tables, nil
}

func (c *clickhouseConnector) Query(ctx context.Context, query string, limit int) (*QueryResult, error) {
	return execQuery(ctx, c.db, query, limit)
}

func buildClickHouseDSN(opts ConnectOptions) string {
	port := opts.Port
	if port == 0 {
		port = 9000
	}
	secure := ""
	if opts.SSLMode == "require" {
		secure = "&secure=true"
	}
	return fmt.Sprintf("clickhouse://%s:%s@%s:%d/%s?dial_timeout=10s&max_execution_time=30%s",
		opts.Username, opts.Password, opts.Host, port, opts.DatabaseName, secure)
}

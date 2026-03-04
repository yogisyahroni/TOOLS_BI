package connectors

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	// MySQL/MariaDB/PlanetScale driver
	_ "github.com/go-sql-driver/mysql"
)

// mySQLConnector implements DBConnector for MySQL / MariaDB / PlanetScale.
type mySQLConnector struct {
	db   *sql.DB
	opts ConnectOptions
}

func newMySQLConnector(opts ConnectOptions) (*mySQLConnector, error) {
	dsn := buildMySQLDSN(opts)
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, fmt.Errorf("mysql: open failed: %w", err)
	}
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(2)
	db.SetConnMaxLifetime(10 * time.Minute)
	return &mySQLConnector{db: db, opts: opts}, nil
}

func (c *mySQLConnector) Ping(ctx context.Context) (int64, error) {
	start := time.Now()
	if err := c.db.PingContext(ctx); err != nil {
		return 0, fmt.Errorf("mysql ping failed: %w", err)
	}
	return time.Since(start).Milliseconds(), nil
}

func (c *mySQLConnector) DriverName() string { return "mysql" }
func (c *mySQLConnector) Close() error       { return c.db.Close() }

func (c *mySQLConnector) IntrospectSchema(ctx context.Context, schema string) ([]TableMeta, error) {
	if schema == "" {
		schema = c.opts.DatabaseName
	}

	tableRows, err := c.db.QueryContext(ctx, `
		SELECT TABLE_NAME, TABLE_TYPE, TABLE_ROWS
		FROM information_schema.TABLES
		WHERE TABLE_SCHEMA = ?
		ORDER BY TABLE_NAME`, schema)
	if err != nil {
		return nil, fmt.Errorf("mysql: table query failed: %w", err)
	}
	defer tableRows.Close()

	var tables []TableMeta
	tableIndex := map[string]int{}
	for tableRows.Next() {
		var tbl TableMeta
		var tblType string
		var rowEst *int64
		if err := tableRows.Scan(&tbl.Name, &tblType, &rowEst); err != nil {
			continue
		}
		tbl.Schema = schema
		tbl.Type = strings.Replace(tblType, "BASE ", "", 1)
		if rowEst != nil {
			tbl.RowEst = *rowEst
		}
		tableIndex[tbl.Name] = len(tables)
		tables = append(tables, tbl)
	}

	// Get columns
	colRows, err := c.db.QueryContext(ctx, `
		SELECT
			c.TABLE_NAME, c.COLUMN_NAME, c.DATA_TYPE, c.IS_NULLABLE,
			c.CHARACTER_MAXIMUM_LENGTH, c.COLUMN_DEFAULT, c.COLUMN_KEY
		FROM information_schema.COLUMNS c
		WHERE c.TABLE_SCHEMA = ?
		ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION`, schema)
	if err != nil {
		return nil, fmt.Errorf("mysql: column query failed: %w", err)
	}
	defer colRows.Close()

	for colRows.Next() {
		var tableName, colName, dataType, isNullable, colKey string
		var maxLen *int
		var colDefault *string
		if err := colRows.Scan(&tableName, &colName, &dataType, &isNullable, &maxLen, &colDefault, &colKey); err != nil {
			continue
		}
		col := ColumnMeta{
			Name:      colName,
			DataType:  dataType,
			Nullable:  isNullable == "YES",
			IsPrimary: colKey == "PRI",
			IsUnique:  colKey == "UNI" || colKey == "PRI",
			MaxLength: maxLen,
			Default:   colDefault,
		}
		if idx, ok := tableIndex[tableName]; ok {
			tables[idx].Columns = append(tables[idx].Columns, col)
		}
	}
	return tables, nil
}

func (c *mySQLConnector) Query(ctx context.Context, query string, limit int) (*QueryResult, error) {
	return execQuery(ctx, c.db, query, limit)
}

// buildMySQLDSN creates a go-sql-driver/mysql DSN.
// PlanetScale: use ?tls=true&interpolateParams=true
func buildMySQLDSN(opts ConnectOptions) string {
	port := opts.Port
	if port == 0 {
		port = 3306
	}
	tls := "false"
	if opts.SSLMode == "require" || strings.Contains(opts.Host, "planetscale") {
		tls = "true"
	}
	return fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?parseTime=true&tls=%s&timeout=10s&readTimeout=30s&writeTimeout=30s",
		opts.Username, opts.Password, opts.Host, port, opts.DatabaseName, tls)
}

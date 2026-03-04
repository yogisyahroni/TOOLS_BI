package connectors

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	// SQL Server driver (Azure SQL, MSSQL)
	_ "github.com/microsoft/go-mssqldb"
)

// mssqlConnector implements DBConnector for Microsoft SQL Server / Azure SQL.
type mssqlConnector struct {
	db   *sql.DB
	opts ConnectOptions
}

func newMSSQLConnector(opts ConnectOptions) (*mssqlConnector, error) {
	dsn := buildMSSQLDSN(opts)
	db, err := sql.Open("mssql", dsn)
	if err != nil {
		return nil, fmt.Errorf("mssql: open failed: %w", err)
	}
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(2)
	db.SetConnMaxLifetime(10 * time.Minute)
	return &mssqlConnector{db: db, opts: opts}, nil
}

func (c *mssqlConnector) Ping(ctx context.Context) (int64, error) {
	start := time.Now()
	if err := c.db.PingContext(ctx); err != nil {
		return 0, fmt.Errorf("mssql ping failed: %w", err)
	}
	return time.Since(start).Milliseconds(), nil
}

func (c *mssqlConnector) DriverName() string { return "mssql" }
func (c *mssqlConnector) Close() error       { return c.db.Close() }

func (c *mssqlConnector) IntrospectSchema(ctx context.Context, schema string) ([]TableMeta, error) {
	if schema == "" {
		schema = "dbo"
	}

	tableRows, err := c.db.QueryContext(ctx, `
		SELECT
			t.TABLE_SCHEMA, t.TABLE_NAME, t.TABLE_TYPE,
			ISNULL(p.rows, 0)
		FROM INFORMATION_SCHEMA.TABLES t
		LEFT JOIN sys.tables st ON st.name = t.TABLE_NAME
		LEFT JOIN sys.partitions p ON p.object_id = st.object_id AND p.index_id IN (0,1)
		WHERE t.TABLE_SCHEMA = @p1
		ORDER BY t.TABLE_NAME`, schema)
	if err != nil {
		return nil, fmt.Errorf("mssql: table query failed: %w", err)
	}
	defer tableRows.Close()

	var tables []TableMeta
	tableIndex := map[string]int{}
	for tableRows.Next() {
		var tbl TableMeta
		if err := tableRows.Scan(&tbl.Schema, &tbl.Name, &tbl.Type, &tbl.RowEst); err != nil {
			continue
		}
		tableIndex[tbl.Name] = len(tables)
		tables = append(tables, tbl)
	}

	colRows, err := c.db.QueryContext(ctx, `
		SELECT
			c.TABLE_NAME, c.COLUMN_NAME, c.DATA_TYPE, c.IS_NULLABLE,
			c.CHARACTER_MAXIMUM_LENGTH, c.COLUMN_DEFAULT,
			CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END,
			CASE WHEN uq.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END
		FROM INFORMATION_SCHEMA.COLUMNS c
		LEFT JOIN (
			SELECT ku.TABLE_NAME, ku.COLUMN_NAME
			FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
			JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
			ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
			WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY' AND tc.TABLE_SCHEMA = @p1
		) pk ON pk.TABLE_NAME = c.TABLE_NAME AND pk.COLUMN_NAME = c.COLUMN_NAME
		LEFT JOIN (
			SELECT ku.TABLE_NAME, ku.COLUMN_NAME
			FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
			JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
			ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
			WHERE tc.CONSTRAINT_TYPE = 'UNIQUE' AND tc.TABLE_SCHEMA = @p1
		) uq ON uq.TABLE_NAME = c.TABLE_NAME AND uq.COLUMN_NAME = c.COLUMN_NAME
		WHERE c.TABLE_SCHEMA = @p1
		ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION`, schema)
	if err != nil {
		return nil, fmt.Errorf("mssql: column query failed: %w", err)
	}
	defer colRows.Close()

	for colRows.Next() {
		var tableName, colName, dataType, isNullable string
		var maxLen *int
		var colDefault *string
		var isPrimary, isUnique int
		if err := colRows.Scan(&tableName, &colName, &dataType, &isNullable, &maxLen, &colDefault, &isPrimary, &isUnique); err != nil {
			continue
		}
		col := ColumnMeta{
			Name:      colName,
			DataType:  dataType,
			Nullable:  isNullable == "YES",
			IsPrimary: isPrimary == 1,
			IsUnique:  isUnique == 1,
			MaxLength: maxLen,
			Default:   colDefault,
		}
		if idx, ok := tableIndex[tableName]; ok {
			tables[idx].Columns = append(tables[idx].Columns, col)
		}
	}
	return tables, nil
}

func (c *mssqlConnector) Query(ctx context.Context, query string, limit int) (*QueryResult, error) {
	// MSSQL uses TOP instead of LIMIT — inject SELECT TOP N wrapper if needed
	if limit > 0 {
		q := fmt.Sprintf("SELECT TOP %d * FROM (%s) AS __mssql_q", limit, query)
		return execQuery(ctx, c.db, q, 0) // don't re-wrap since already limited
	}
	return execQuery(ctx, c.db, query, 0)
}

// buildMSSQLDSN creates an mssql DSN.
// Azure SQL example: sqlserver://username:password@server.database.windows.net?database=mydb&encrypt=true
func buildMSSQLDSN(opts ConnectOptions) string {
	port := opts.Port
	if port == 0 {
		port = 1433
	}
	encrypt := "disable"
	if opts.SSLMode == "require" {
		encrypt = "true"
	}
	return fmt.Sprintf("sqlserver://%s:%s@%s:%d?database=%s&encrypt=%s&connection+timeout=10",
		opts.Username, opts.Password, opts.Host, port, opts.DatabaseName, encrypt)
}

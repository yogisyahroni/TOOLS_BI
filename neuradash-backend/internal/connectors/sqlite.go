package connectors

import (
	"context"
	"database/sql"
	"fmt"
	"time"
	// SQLite driver (pure Go or CGO — using pure-go modernc.org/sqlite)
	// We use a fallback to the file-based approach
)

// sqliteConnector implements DBConnector for SQLite files.
// Useful for local testing and embedded database scenarios.
type sqliteConnector struct {
	db   *sql.DB
	opts ConnectOptions
}

func newSQLiteConnector(opts ConnectOptions) (*sqliteConnector, error) {
	// For SQLite, Host is treated as the file path
	filePath := opts.Host
	if filePath == "" {
		filePath = opts.DatabaseName
	}
	if filePath == "" {
		return nil, fmt.Errorf("sqlite: provide the file path in 'host' or 'databaseName' field")
	}

	db, err := sql.Open("sqlite3", filePath)
	if err != nil {
		return nil, fmt.Errorf("sqlite: open failed: %w", err)
	}
	db.SetMaxOpenConns(1) // SQLite is single-writer
	db.SetConnMaxLifetime(0)
	return &sqliteConnector{db: db, opts: opts}, nil
}

func (c *sqliteConnector) Ping(ctx context.Context) (int64, error) {
	start := time.Now()
	if err := c.db.PingContext(ctx); err != nil {
		return 0, fmt.Errorf("sqlite ping failed: %w", err)
	}
	return time.Since(start).Milliseconds(), nil
}

func (c *sqliteConnector) DriverName() string { return "sqlite3" }
func (c *sqliteConnector) Close() error       { return c.db.Close() }

func (c *sqliteConnector) IntrospectSchema(ctx context.Context, _ string) ([]TableMeta, error) {
	// SQLite has no schemas — use sqlite_master
	rows, err := c.db.QueryContext(ctx, `
		SELECT name, type
		FROM sqlite_master
		WHERE type IN ('table','view')
		  AND name NOT LIKE 'sqlite_%'
		ORDER BY name`)
	if err != nil {
		return nil, fmt.Errorf("sqlite: table query failed: %w", err)
	}
	defer rows.Close()

	var tables []TableMeta
	for rows.Next() {
		var tbl TableMeta
		if err := rows.Scan(&tbl.Name, &tbl.Type); err != nil {
			continue
		}
		tbl.Schema = "main"

		// PRAGMA table_info for columns
		colRows, err := c.db.QueryContext(ctx,
			fmt.Sprintf("PRAGMA table_info(%q)", tbl.Name))
		if err == nil {
			defer colRows.Close()
			for colRows.Next() {
				var cid int
				var name, dataType string
				var notNull int
				var dfltValue *string
				var pk int
				if err := colRows.Scan(&cid, &name, &dataType, &notNull, &dfltValue, &pk); err != nil {
					continue
				}
				tbl.Columns = append(tbl.Columns, ColumnMeta{
					Name:      name,
					DataType:  dataType,
					Nullable:  notNull == 0,
					IsPrimary: pk > 0,
					Default:   dfltValue,
				})
			}
		}
		tables = append(tables, tbl)
	}
	return tables, nil
}

func (c *sqliteConnector) Query(ctx context.Context, query string, limit int) (*QueryResult, error) {
	return execQuery(ctx, c.db, query, limit)
}

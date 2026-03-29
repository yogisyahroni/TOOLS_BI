package services

import (
	"context"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ETLStorageService handles dynamic table creation and data persistence for ETL results.
type ETLStorageService struct {
	localDB    *gorm.DB
	supabaseDB *gorm.DB // optional
}

// NewETLStorageService creates a new ETLStorageService.
func NewETLStorageService(localDB *gorm.DB, supabaseDB *gorm.DB) *ETLStorageService {
	return &ETLStorageService{
		localDB:    localDB,
		supabaseDB: supabaseDB,
	}
}

// PersistETLResult stores ETL rows into a dynamic table in both databases.
// If upsertKey is provided, it performs an UPSERT (ON CONFLICT DO UPDATE) instead of simple INSERT.
func (s *ETLStorageService) PersistETLResult(ctx context.Context, tableName string, rows []map[string]interface{}, upsertKey string) error {
	if len(rows) == 0 {
		return nil
	}

	// SUB-ROUTINE BETA: Data Sanitization.
	// Convert all time.Time objects to RFC3339 strings.
	// This ensures compatibility with both TEXT and TIMESTAMPTZ columns in Postgres
	// and fixes the "cannot find encode plan" error in dynamic table inserts.
	for i := range rows {
		for k, v := range rows[i] {
			if t, ok := v.(time.Time); ok {
				rows[i][k] = t.Format(time.RFC3339)
			}
		}
	}

	// 1. Ensure table exists in local DB
	if err := s.ensureTableExists(s.localDB, tableName, rows[0], upsertKey); err != nil {
		return fmt.Errorf("local db: failed to ensure table: %w", err)
	}

	// 2. Insert into local DB in batches of 1000
	db := s.localDB.WithContext(ctx).Table(tableName)
	if upsertKey != "" {
		// SUB-ROUTINE BETA: Explicit column calculation to avoid "model value required" error.
		// GORM's UpdateAll: true requires a struct model to detect all columns. 
		// For dynamic tables, we must specify them manually.
		updateCols := make([]string, 0, len(rows[0]))
		for k := range rows[0] {
			if k != upsertKey {
				updateCols = append(updateCols, k)
			}
		}

		db = db.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: upsertKey}},
			DoUpdates: clause.AssignmentColumns(updateCols),
		})
	}
	
	if err := db.CreateInBatches(rows, 1000).Error; err != nil {
		return fmt.Errorf("local db: failed to insert/upsert rows: %w", err)
	}

	// 3. Sync to Supabase if configured
	if s.supabaseDB != nil {
		if err := s.ensureTableExists(s.supabaseDB, tableName, rows[0], upsertKey); err != nil {
			return fmt.Errorf("supabase db: failed to ensure table: %w", err)
		}
		
		sDB := s.supabaseDB.WithContext(ctx).Table(tableName)
		if upsertKey != "" {
			updateCols := make([]string, 0, len(rows[0]))
			for k := range rows[0] {
				if k != upsertKey {
					updateCols = append(updateCols, k)
				}
			}

			sDB = sDB.Clauses(clause.OnConflict{
				Columns:   []clause.Column{{Name: upsertKey}},
				DoUpdates: clause.AssignmentColumns(updateCols),
			})
		}

		if err := sDB.CreateInBatches(rows, 1000).Error; err != nil {
			return fmt.Errorf("supabase db: failed to insert/upsert rows: %w", err)
		}
	}

	return nil
}

// ensureTableExists dynamically creates or migrates a table based on data keys.
func (s *ETLStorageService) ensureTableExists(db *gorm.DB, tableName string, sampleRow map[string]interface{}, upsertKey string) error {
	// SANITY CHECK: Validate table name to prevent SQL injection
	if strings.ContainsAny(tableName, " ;'\"--") {
		return fmt.Errorf("invalid table name: %s", tableName)
	}

	// For UPSERT mode, we don't drop the table if it exists.
	// But for standard OVERWRITE mode (default), we always want a fresh table.
	if db.Migrator().HasTable(tableName) {
		if upsertKey == "" {
			if err := db.Migrator().DropTable(tableName); err != nil {
				return fmt.Errorf("failed to drop existing table %s: %w", tableName, err)
			}
		} else {
			// In UPSERT mode, the table exists - we are good.
			// Just ensure the UNIQUE index exists on the upsertKey.
			// We try to create it, ignoring errors if it already exists.
			indexName := fmt.Sprintf("idx_%s_%s_unique", tableName, upsertKey)
			db.Exec(fmt.Sprintf("CREATE UNIQUE INDEX IF NOT EXISTS %s ON \"%s\" (\"%s\")", indexName, tableName, upsertKey))
			return nil 
		}
	}

	// GORM's AutoMigrate needs a struct or map with types. 
	// Since it's dynamic, we construct a raw DDL or use a generic model.
	// For simplicity and to follow SUB-ROUTINE BETA's "Memory-Safe" mandate, 
	// we will create the table using a mapped schema.

	columns := []string{}
	for k, v := range sampleRow {
		pgType := s.mapToPostgresType(v)
		columns = append(columns, fmt.Sprintf("\"%s\" %s", k, pgType))
	}

	query := fmt.Sprintf("CREATE TABLE \"%s\" (%s)", tableName, strings.Join(columns, ", "))
	if err := db.Exec(query).Error; err != nil {
		return err
	}

	// If we have an upsertKey, create a UNIQUE index on it immediately
	if upsertKey != "" {
		indexName := fmt.Sprintf("idx_%s_%s_unique", tableName, upsertKey)
		return db.Exec(fmt.Sprintf("CREATE UNIQUE INDEX %s ON \"%s\" (\"%s\")", indexName, tableName, upsertKey)).Error
	}

	return nil
}

func (s *ETLStorageService) mapToPostgresType(v interface{}) string {
	switch v.(type) {
	case int, int64:
		return "BIGINT"
	case float64:
		return "DOUBLE PRECISION"
	case bool:
		return "BOOLEAN"
	case string:
		return "TEXT"
	case time.Time:
		return "TIMESTAMPTZ"
	default:
		return "TEXT"
	}
}

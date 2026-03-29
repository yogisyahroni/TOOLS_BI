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

// PrepareTargetTable ensures the output table is ready for the ETL run.
// It drops the table for OVERWRITE mode or ensures the UNIQUE index for UPSERT mode.
func (s *ETLStorageService) PrepareTargetTable(ctx context.Context, tableName string, sampleRow map[string]interface{}, upsertKey string) error {
	// SANITY CHECK: Validate table name to prevent SQL injection
	if strings.ContainsAny(tableName, " ;'\"--") {
		return fmt.Errorf("invalid table name: %s", tableName)
	}

	// Helper to prepare a single DB
	prepare := func(db *gorm.DB) error {
		if db.Migrator().HasTable(tableName) {
			if upsertKey == "" {
				if err := db.Migrator().DropTable(tableName); err != nil {
					return fmt.Errorf("failed to drop existing table %s: %w", tableName, err)
				}
			} else {
				// In UPSERT mode, ensure the UNIQUE index exists
				indexName := fmt.Sprintf("idx_%s_%s_unique", strings.ReplaceAll(tableName, ".", "_"), upsertKey)
				// Use PostgreSQL-specific syntax for safety
				return db.Exec(fmt.Sprintf("CREATE UNIQUE INDEX IF NOT EXISTS %s ON \"%s\" (\"%s\")", indexName, tableName, upsertKey)).Error
			}
		}

		// Create table if it doesn't exist (or was just dropped)
		if !db.Migrator().HasTable(tableName) {
			columns := []string{}
			for k, v := range sampleRow {
				pgType := s.mapToPostgresType(v)
				columns = append(columns, fmt.Sprintf("\"%s\" %s", k, pgType))
			}
			query := fmt.Sprintf("CREATE TABLE \"%s\" (%s)", tableName, strings.Join(columns, ", "))
			if err := db.Exec(query).Error; err != nil {
				return err
			}

			if upsertKey != "" {
				indexName := fmt.Sprintf("idx_%s_%s_unique", strings.ReplaceAll(tableName, ".", "_"), upsertKey)
				return db.Exec(fmt.Sprintf("CREATE UNIQUE INDEX %s ON \"%s\" (\"%s\")", indexName, tableName, upsertKey)).Error
			}
		}
		return nil
	}

	if err := prepare(s.localDB); err != nil {
		return fmt.Errorf("local db prepare error: %w", err)
	}
	if s.supabaseDB != nil {
		if err := prepare(s.supabaseDB); err != nil {
			return fmt.Errorf("supabase db prepare error: %w", err)
		}
	}

	return nil
}

// PersistETLResult stores ETL rows into a dynamic table.
// Assumes PrepareTargetTable was called once before starting batches.
func (s *ETLStorageService) PersistETLResult(ctx context.Context, tableName string, rows []map[string]interface{}, upsertKey string) error {
	if len(rows) == 0 {
		return nil
	}

	// SUB-ROUTINE BETA: Data Sanitization (Timestamps).
	for i := range rows {
		for k, v := range rows[i] {
			if t, ok := v.(time.Time); ok {
				rows[i][k] = t.Format(time.RFC3339)
			}
		}
	}

	// Batch insert/upsert helper
	persist := func(db *gorm.DB) error {
		tx := db.WithContext(ctx).Table(tableName)
		if upsertKey != "" {
			updateCols := make([]string, 0, len(rows[0]))
			for k := range rows[0] {
				if k != upsertKey {
					updateCols = append(updateCols, k)
				}
			}

			tx = tx.Clauses(clause.OnConflict{
				Columns:   []clause.Column{{Name: upsertKey}},
				DoUpdates: clause.AssignmentColumns(updateCols),
			})
		}
		return tx.CreateInBatches(rows, 1000).Error
	}

	if err := persist(s.localDB); err != nil {
		return fmt.Errorf("local db persist error: %w", err)
	}
	if s.supabaseDB != nil {
		if err := persist(s.supabaseDB); err != nil {
			return fmt.Errorf("supabase db persist error: %w", err)
		}
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

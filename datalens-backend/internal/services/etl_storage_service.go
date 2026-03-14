package services

import (
	"context"
	"fmt"
	"strings"

	"gorm.io/gorm"
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
func (s *ETLStorageService) PersistETLResult(ctx context.Context, tableName string, rows []map[string]interface{}) error {
	if len(rows) == 0 {
		return nil
	}

	// 1. Ensure table exists in local DB
	if err := s.ensureTableExists(s.localDB, tableName, rows[0]); err != nil {
		return fmt.Errorf("local db: failed to ensure table: %w", err)
	}

	// 2. Insert into local DB
	if err := s.localDB.WithContext(ctx).Table(tableName).Create(rows).Error; err != nil {
		return fmt.Errorf("local db: failed to insert rows: %w", err)
	}

	// 3. Sync to Supabase if configured
	if s.supabaseDB != nil {
		if err := s.ensureTableExists(s.supabaseDB, tableName, rows[0]); err != nil {
			return fmt.Errorf("supabase db: failed to ensure table: %w", err)
		}
		if err := s.supabaseDB.WithContext(ctx).Table(tableName).Create(rows).Error; err != nil {
			return fmt.Errorf("supabase db: failed to insert rows: %w", err)
		}
	}

	return nil
}

// ensureTableExists dynamically creates or migrates a table based on data keys.
func (s *ETLStorageService) ensureTableExists(db *gorm.DB, tableName string, sampleRow map[string]interface{}) error {
	// SANITY CHECK: Validate table name to prevent SQL injection
	if strings.ContainsAny(tableName, " ;'\"--") {
		return fmt.Errorf("invalid table name: %s", tableName)
	}

	// Optimization: check if table exists first
	if db.Migrator().HasTable(tableName) {
		// For now, we assume schema is stable per run or use AutoMigrate
		// A more advanced version would diff the keys and add missing columns
		return nil
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
	return db.Exec(query).Error
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
	default:
		return "TEXT"
	}
}

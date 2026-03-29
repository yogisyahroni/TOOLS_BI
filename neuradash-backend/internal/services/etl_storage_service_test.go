package services

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestETLStorageService_PersistETLResult(t *testing.T) {
	// Setup in-memory SQLite for testing
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	assert.NoError(t, err)

	svc := NewETLStorageService(db, nil)
	ctx := context.Background()

	tableName := "test_etl_output"
	rows := []map[string]interface{}{
		{
			"id":        1,
			"name":      "Item 1",
			"value":     10.5,
			"is_active": true,
		},
		{
			"id":        2,
			"name":      "Item 2",
			"value":     20.0,
			"is_active": false,
		},
	}

	// Must prepare table first
	err = svc.PrepareTargetTable(ctx, tableName, rows[0], "")
	assert.NoError(t, err)

	err = svc.PersistETLResult(ctx, tableName, rows, "")
	assert.NoError(t, err)

	// Verify table exists and data is inserted
	var count int64
	err = db.Table(tableName).Count(&count).Error
	assert.NoError(t, err)
	assert.Equal(t, int64(2), count)

	// Check specific row content
	var result map[string]interface{}
	err = db.Table(tableName).First(&result).Error
	assert.NoError(t, err)
	assert.Equal(t, "Item 1", result["name"])
	assert.Equal(t, float64(10.5), result["value"])
}

func TestETLStorageService_InvalidTableName(t *testing.T) {
	db, _ := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	svc := NewETLStorageService(db, nil)

	err := svc.PersistETLResult(context.Background(), "invalid; table", []map[string]interface{}{{"id": 1}}, "")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "invalid table name")
}

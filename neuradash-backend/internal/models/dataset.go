package models

import (
	"encoding/json"
	"time"
)

// Dataset represents metadata for an uploaded data file.
type Dataset struct {
	ID            string          `json:"id" gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	UserID        string          `json:"userId" gorm:"type:uuid;not null;index"`
	Name          string          `json:"name" gorm:"not null"`
	FileName      string          `json:"fileName"`
	Columns       json.RawMessage `json:"columns" gorm:"type:jsonb;default:'[]'"`
	RowCount      int             `json:"rowCount" gorm:"default:0"`
	SizeBytes     int64           `json:"sizeBytes" gorm:"default:0"`
	StorageKey    string          `json:"storageKey"`    // S3/MinIO key
	DataTableName string          `json:"dataTableName"` // dynamic table holding actual data
	RefreshConfig json.RawMessage `json:"refreshConfig" gorm:"type:jsonb"`
	Version       int             `json:"version" gorm:"default:0"` // optimistic locking
	DeletedAt     *time.Time      `json:"deletedAt,omitempty" gorm:"index"`
	CreatedAt     time.Time       `json:"createdAt"`
	UpdatedAt     time.Time       `json:"updatedAt"`
}

func (Dataset) TableName() string { return "datasets" }

// ColumnDef describes one column in the dataset.
type ColumnDef struct {
	Name        string `json:"name"`
	Type        string `json:"type"` // string, number, date, boolean
	Nullable    bool   `json:"nullable"`
	SampleVals  []any  `json:"sampleVals,omitempty"`
	CalcFormula string `json:"calcFormula,omitempty"` // For frontend and stats engines to evaluate DLX formulas
}

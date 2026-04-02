package models

import (
	"encoding/json"
	"time"
)

// SavedChart is a persisted chart configuration.
type SavedChart struct {
	ID          string          `json:"id" gorm:"size:255;primaryKey"`
	UserID      string          `json:"userId" gorm:"size:255;not null;index"`
	DatasetID   string          `json:"datasetId" gorm:"size:255;not null;index"`
	Title       string          `json:"title" gorm:"not null"`
	Type        string          `json:"type" gorm:"not null"` // bar,line,pie,donut,area,scatter,radar,funnel,treemap,stat
	XAxis       string          `json:"xAxis" gorm:"size:100"`
	YAxis       string          `json:"yAxis" gorm:"size:100"`
	GroupBy     string          `json:"groupBy" gorm:"size:100"`
	Config      json.RawMessage `json:"config" gorm:"type:jsonb;default:'{}'"`
	Annotations json.RawMessage `json:"annotations" gorm:"type:jsonb;default:'[]'"`
	DeletedAt   *time.Time      `json:"deletedAt,omitempty" gorm:"index"` // Phase 36: soft-delete
	CreatedAt   time.Time       `json:"createdAt"`
}

func (SavedChart) TableName() string { return "saved_charts" }

package models

import (
	"encoding/json"
	"time"
)

// Report represents an AI-generated or manual analytics report.
type Report struct {
	ID              string          `json:"id" gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	UserID          string          `json:"userId" gorm:"type:uuid;not null;index"`
	DatasetID       *string         `json:"datasetId" gorm:"type:uuid;index"`
	Title           string          `json:"title" gorm:"not null"`
	Content         string          `json:"content" gorm:"type:text"`
	Story           string          `json:"story" gorm:"type:text"`
	Decisions       json.RawMessage `json:"decisions" gorm:"type:jsonb;default:'[]'"`
	Recommendations json.RawMessage `json:"recommendations" gorm:"type:jsonb;default:'[]'"`
	ChartConfigs    json.RawMessage `json:"chartConfigs" gorm:"type:jsonb;default:'[]'"`
	DeletedAt       *time.Time      `json:"deletedAt,omitempty" gorm:"index"` // Phase 36: soft-delete
	CreatedAt       time.Time       `json:"createdAt"`
}

func (Report) TableName() string { return "reports" }

// DataStory represents an AI-generated narrative data story.
type DataStory struct {
	ID        string          `json:"id" gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	UserID    string          `json:"userId" gorm:"type:uuid;not null;index"`
	DatasetID *string         `json:"datasetId" gorm:"type:uuid;index"`
	Title     string          `json:"title" gorm:"not null"`
	Narrative string          `json:"content" gorm:"type:text;column:narrative"`
	Insights  json.RawMessage `json:"insights" gorm:"type:jsonb;default:'[]'"`
	Charts    json.RawMessage `json:"charts" gorm:"type:jsonb;default:'[]'"`
	DeletedAt *time.Time      `json:"deletedAt,omitempty" gorm:"index"` // Phase 36: soft-delete
	CreatedAt time.Time       `json:"createdAt"`
}

func (DataStory) TableName() string { return "data_stories" }

package models

import (
	"encoding/json"
	"time"
)

// ETLPipeline is a simple (non-visual) ETL pipeline.
type ETLPipeline struct {
	ID              string          `json:"id" gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	UserID          string          `json:"userId" gorm:"type:uuid;not null;index"`
	Name            string          `json:"name" gorm:"not null"`
	SourceDatasetID string          `json:"sourceDatasetId" gorm:"type:uuid;not null;index"`
	OutputDatasetID *string         `json:"outputDatasetId" gorm:"type:uuid;index"`
	OutputTableName string          `json:"outputTableName" gorm:"type:text"`
	OutputData      json.RawMessage `json:"outputData" gorm:"type:jsonb;default:'[]'"`
	Steps           json.RawMessage `json:"steps" gorm:"type:jsonb;default:'[]'"`
	Status          string          `json:"status" gorm:"default:idle"` // idle,running,completed,error
	LastRunAt       *time.Time      `json:"lastRunAt"`
	InputRows       *int            `json:"inputRows"`
	OutputRows      *int            `json:"outputRows"`
	ProcessedRows   int             `json:"processedRows" gorm:"default:0"`
	Error           string          `json:"error" gorm:"type:text"`
	UpsertKey       string          `json:"upsertKey" gorm:"type:text"`
	CreatedAt       time.Time       `json:"createdAt"`
}

func (ETLPipeline) TableName() string { return "etl_pipelines" }

// VisualPipeline is a drag-and-drop visual ETL pipeline.
type VisualPipeline struct {
	ID                string          `json:"id" gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	UserID            string          `json:"userId" gorm:"type:uuid;not null;index"`
	Name              string          `json:"name" gorm:"not null"`
	Description       string          `json:"description" gorm:"type:text"`
	Nodes             json.RawMessage `json:"nodes" gorm:"type:jsonb;default:'[]'"`
	Edges             json.RawMessage `json:"edges" gorm:"type:jsonb;default:'[]'"`
	Status            string          `json:"status" gorm:"default:draft;index"` // draft,running,completed,error,scheduled
	LastRunAt         *time.Time      `json:"lastRunAt"`
	LastRunDurationMs *int            `json:"lastRunDurationMs"`
	LastError         string          `json:"lastError" gorm:"type:text"`
	OutputDatasetID   *string         `json:"outputDatasetId" gorm:"type:uuid;index"`
	OutputTableName   string          `json:"outputTableName" gorm:"type:text"`
	Schedule          string          `json:"schedule"`
	IsTemplate        bool            `json:"isTemplate" gorm:"default:false"`
	Tags              json.RawMessage `json:"tags" gorm:"type:jsonb;default:'[]'"`
	UpsertKey         string          `json:"upsertKey" gorm:"type:text"`
	CreatedAt         time.Time       `json:"createdAt"`
	UpdatedAt         time.Time       `json:"updatedAt"`
}

func (VisualPipeline) TableName() string { return "visual_pipelines" }

// PipelineRun records one execution of a visual pipeline.
type PipelineRun struct {
	ID          string          `json:"id" gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	PipelineID  string          `json:"pipelineId" gorm:"type:uuid;not null;index"`
	Status      string          `json:"status" gorm:"not null"` // running,completed,error
	StartedAt   time.Time       `json:"startedAt" gorm:"default:now()"`
	CompletedAt *time.Time      `json:"completedAt"`
	DurationMs  *int            `json:"durationMs"`
	NodeResults json.RawMessage `json:"nodeResults" gorm:"type:jsonb;default:'{}'"`
	InputRows   *int            `json:"inputRows"`
	OutputRows  *int            `json:"outputRows"`
	Error       string          `json:"error" gorm:"type:text"`
	TriggeredBy string          `json:"triggeredBy" gorm:"default:manual"` // manual,cron,webhook
}

func (PipelineRun) TableName() string { return "pipeline_runs" }

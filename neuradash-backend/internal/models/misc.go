package models

import (
	"encoding/json"
	"time"
)

// Bookmark saves a filtered/sorted view of a dataset.
type Bookmark struct {
	ID            string          `json:"id" gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	UserID        string          `json:"userId" gorm:"type:uuid;not null;index"`
	DatasetID     string          `json:"datasetId" gorm:"type:uuid;not null;index"`
	Name          string          `json:"name" gorm:"not null"`
	Filters       json.RawMessage `json:"filters" gorm:"type:jsonb;default:'[]'"`
	SortColumn    string          `json:"sortColumn" gorm:"size:100"`
	SortDirection string          `json:"sortDirection" gorm:"size:4"` // asc, desc
	CreatedAt     time.Time       `json:"createdAt"`
}

func (Bookmark) TableName() string { return "bookmarks" }

// CalculatedField represents a DAX-like formula column.
type CalculatedField struct {
	ID        string    `json:"id" gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	UserID    string    `json:"userId" gorm:"type:uuid;not null;index"`
	DatasetID string    `json:"datasetId" gorm:"type:uuid;not null;index"`
	Name      string    `json:"name" gorm:"size:100;not null"`
	Formula   string    `json:"formula" gorm:"type:text;not null"`
	CreatedAt time.Time `json:"createdAt"`
}

func (CalculatedField) TableName() string { return "calculated_fields" }

// RLSRule defines a Row-Level Security constraint.
type RLSRule struct {
	ID            string          `json:"id" gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	UserID        string          `json:"userId" gorm:"type:uuid;not null;index"`
	DatasetID     string          `json:"datasetId" gorm:"type:uuid;not null;index"`
	Role          string          `json:"role" gorm:"size:50;not null"`
	ColumnName    string          `json:"columnName" gorm:"size:100;not null"`
	AllowedValues json.RawMessage `json:"allowedValues" gorm:"type:jsonb;default:'[]'"`
	Enabled       bool            `json:"enabled" gorm:"default:true"`
	CreatedAt     time.Time       `json:"createdAt"`
}

func (RLSRule) TableName() string { return "rls_rules" }

// DataRelationship links two datasets via shared keys.
type DataRelationship struct {
	ID              string    `json:"id" gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	UserID          string    `json:"userId" gorm:"type:uuid;not null;index"`
	SourceDatasetID string    `json:"sourceDatasetId" gorm:"type:uuid;not null;index"`
	TargetDatasetID string    `json:"targetDatasetId" gorm:"type:uuid;not null;index"`
	SourceColumn    string    `json:"sourceColumn" gorm:"size:100;not null"`
	TargetColumn    string    `json:"targetColumn" gorm:"size:100;not null"`
	RelType         string    `json:"relType" gorm:"not null"` // one-to-one,one-to-many,many-to-many
	CreatedAt       time.Time `json:"createdAt"`
}

func (DataRelationship) TableName() string { return "data_relationships" }

// Parameter represents a dashboard-level variable.
type Parameter struct {
	ID           string          `json:"id" gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	UserID       string          `json:"userId" gorm:"type:uuid;not null;index"`
	DashboardID  string          `json:"dashboardId" gorm:"type:uuid;not null;index"`
	Name         string          `json:"name" gorm:"size:100;not null"`
	Type         string          `json:"type" gorm:"not null"` // number,text,list,date
	DefaultValue string          `json:"defaultValue"`
	MinVal       *float64        `json:"minVal"`
	MaxVal       *float64        `json:"maxVal"`
	Options      json.RawMessage `json:"options" gorm:"type:jsonb"` // for list type
	CreatedAt    time.Time       `json:"createdAt"`
}

func (Parameter) TableName() string { return "parameters" }

// AuditLog records write operations for compliance.
type AuditLog struct {
	ID           int64           `json:"id" gorm:"primaryKey;autoIncrement"`
	UserID       *string         `json:"userId" gorm:"type:uuid;index"`
	Action       string          `json:"action" gorm:"size:50;not null"`
	ResourceType string          `json:"resourceType" gorm:"size:50;not null"`
	ResourceID   *string         `json:"resourceId" gorm:"type:uuid"`
	Details      json.RawMessage `json:"details" gorm:"type:jsonb"`
	IPAddress    string          `json:"ipAddress" gorm:"type:inet"`
	CreatedAt    time.Time       `json:"createdAt"`
}

func (AuditLog) TableName() string { return "audit_log" }

// Annotation stores reference lines on charts (BUG-H6 fix).
type Annotation struct {
	ID        string    `json:"id" gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	UserID    string    `json:"userId" gorm:"type:uuid;not null;index"`
	DatasetID string    `json:"datasetId" gorm:"type:uuid;not null;index"`
	XCol      string    `json:"xCol" gorm:"size:100"`
	YCol      string    `json:"yCol" gorm:"size:100"`
	Label     string    `json:"label" gorm:"size:200;not null"`
	Value     float64   `json:"value" gorm:"not null"`
	Color     string    `json:"color" gorm:"size:50"`
	AnnoType  string    `json:"type" gorm:"column:anno_type;size:20;default:'line'"`
	CreatedAt time.Time `json:"createdAt"`
}

func (Annotation) TableName() string { return "annotations" }

// FormatRule defines a conditional formatting rule for a dataset column (BUG-M4).
type FormatRule struct {
	ID        string    `json:"id" gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	UserID    string    `json:"userId" gorm:"type:uuid;not null;index"`
	DatasetID string    `json:"datasetId" gorm:"type:uuid;not null;index"`
	Column    string    `json:"column" gorm:"size:100;not null"`
	Condition string    `json:"condition" gorm:"size:20;not null"` // gt,lt,gte,lte,eq,contains,empty
	Value     string    `json:"value" gorm:"size:255"`
	BgColor   string    `json:"bgColor" gorm:"size:100"`
	TextColor string    `json:"textColor" gorm:"size:100"`
	CreatedAt time.Time `json:"createdAt"`
}

func (FormatRule) TableName() string { return "format_rules" }

// DrillConfig stores the drill-down hierarchy configuration for a dataset (BUG-M2).
type DrillConfig struct {
	ID        string          `json:"id" gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	UserID    string          `json:"userId" gorm:"type:uuid;not null;index"`
	DatasetID string          `json:"datasetId" gorm:"type:uuid;not null;index"`
	Hierarchy json.RawMessage `json:"hierarchy" gorm:"type:jsonb;default:'[]'"` // ["col1","col2","col3"]
	MetricCol string          `json:"metricCol" gorm:"size:100"`
	AggFn     string          `json:"aggFn" gorm:"size:20;default:'count'"` // count, sum, avg
	CreatedAt time.Time       `json:"createdAt"`
	UpdatedAt time.Time       `json:"updatedAt"`
}

func (DrillConfig) TableName() string { return "drill_configs" }

// EmbedToken is a secure, revocable token for embedding dashboards/charts (BUG-M5).
type EmbedToken struct {
	ID           string     `json:"id" gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	UserID       string     `json:"userId" gorm:"type:uuid;not null;index"`
	ResourceID   string     `json:"resourceId" gorm:"type:uuid;not null"`
	ResourceType string     `json:"resourceType" gorm:"size:20;not null"` // dashboard, chart
	ShowToolbar  bool       `json:"showToolbar" gorm:"default:true"`
	Width        int        `json:"width" gorm:"default:800"`
	Height       int        `json:"height" gorm:"default:600"`
	ExpiresAt    *time.Time `json:"expiresAt"`
	AccessCount  int        `json:"accessCount" gorm:"default:0"`
	Revoked      bool       `json:"revoked" gorm:"default:false"`
	CreatedAt    time.Time  `json:"createdAt"`
}

func (EmbedToken) TableName() string { return "embed_tokens" }

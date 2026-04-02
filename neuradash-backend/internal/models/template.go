package models

import (
	"encoding/json"
	"time"
)

// ReportTemplate is a reusable report layout (built-in or imported).
type ReportTemplate struct {
	ID          string          `json:"id" gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	UserID      *string         `json:"userId" gorm:"type:uuid;index"`
	Name        string          `json:"name" gorm:"not null"`
	Description string          `json:"description" gorm:"type:text"`
	Category    string          `json:"category" gorm:"not null;index"` // executive,operational,client,performance,financial,logistics,sales,custom
	Source      string          `json:"source" gorm:"not null"`         // builtin,powerbi,tableau,metabase,pptx,custom
	Pages       json.RawMessage `json:"pages" gorm:"type:jsonb;default:'[]'"`
	ColorScheme json.RawMessage `json:"colorScheme" gorm:"type:jsonb;default:'{}'"`
	IsDefault   bool            `json:"isDefault" gorm:"default:false"`
	SourceMetadata  json.RawMessage `json:"sourceMetadata" gorm:"type:jsonb;default:'[]'"`
	ProcessedCount  int             `json:"processedCount" gorm:"default:0"`
	MigrationStatus json.RawMessage `json:"migrationStatus" gorm:"type:jsonb;default:null"`
	CreatedAt       time.Time       `json:"createdAt"`
	UpdatedAt       time.Time       `json:"updatedAt"`
}

func (ReportTemplate) TableName() string { return "report_templates" }

// DBConnection holds credentials for an external database.
type DBConnection struct {
	ID                string     `json:"id" gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	UserID            string     `json:"userId" gorm:"type:uuid;not null;index"`
	Name              string     `json:"name" gorm:"not null"`
	DBType            string     `json:"dbType" gorm:"not null"` // postgresql,mysql,sqlserver,sqlite
	Host              string     `json:"host" gorm:"not null"`
	Port              int        `json:"port" gorm:"not null"`
	DatabaseName      string     `json:"databaseName" gorm:"not null"`
	Username          string     `json:"username" gorm:"not null"`
	PasswordEncrypted string     `json:"-" gorm:"not null"` // AES-256-GCM encrypted
	SSLMode           string     `json:"sslMode" gorm:"default:prefer"`
	SchemaName        string     `json:"schemaName" gorm:"default:public"`
	IsActive          bool       `json:"isActive" gorm:"default:true"`
	LastSyncedAt      *time.Time `json:"lastSyncedAt"`
	CreatedAt         time.Time  `json:"createdAt"`
	UpdatedAt         time.Time  `json:"updatedAt"`
}

func (DBConnection) TableName() string { return "db_connections" }

// SchemaTable stores introspected table metadata from an external DB.
type SchemaTable struct {
	ID           string          `json:"id" gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	ConnectionID string          `json:"connectionId" gorm:"type:uuid;not null;index"`
	TblName      string          `json:"tableName" gorm:"column:table_name;not null"`
	SchemaName   string          `json:"schemaName" gorm:"default:public"`
	RowCount     int64           `json:"rowCount" gorm:"default:0"`
	TblType      string          `json:"tableType" gorm:"column:table_type;default:table"` // table,view,materialized_view
	Comment      string          `json:"comment"`
	Columns      json.RawMessage `json:"columns" gorm:"type:jsonb;default:'[]'"`
	PrimaryKeys  json.RawMessage `json:"primaryKeys" gorm:"type:jsonb;default:'[]'"`
	Indexes      json.RawMessage `json:"indexes" gorm:"type:jsonb;default:'[]'"`
	SyncedAt     time.Time       `json:"syncedAt"`
}

func (SchemaTable) TableName() string { return "schema_tables" }

// SchemaRelationship stores FK relationships in an external DB.
type SchemaRelationship struct {
	ID             string    `json:"id" gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	ConnectionID   string    `json:"connectionId" gorm:"type:uuid;not null;index"`
	ConstraintName string    `json:"constraintName"`
	SourceTable    string    `json:"sourceTable" gorm:"not null"`
	SourceColumn   string    `json:"sourceColumn" gorm:"not null"`
	TargetTable    string    `json:"targetTable" gorm:"not null"`
	TargetColumn   string    `json:"targetColumn" gorm:"not null"`
	RelType        string    `json:"relType" gorm:"not null"` // one-to-one,one-to-many,many-to-many
	OnDelete       string    `json:"onDelete" gorm:"default:'NO ACTION'"`
	OnUpdate       string    `json:"onUpdate" gorm:"default:'NO ACTION'"`
	SyncedAt       time.Time `json:"syncedAt"`
}

func (SchemaRelationship) TableName() string { return "schema_relationships" }

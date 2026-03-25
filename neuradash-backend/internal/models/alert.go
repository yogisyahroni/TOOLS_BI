package models

import (
	"time"
)

// DataAlert represents a threshold-based data alert.
type DataAlert struct {
	ID            string     `json:"id" gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	UserID        string     `json:"userId" gorm:"type:uuid;not null;index"`
	DatasetID     string     `json:"datasetId" gorm:"type:uuid;not null;index"`
	Name          string     `json:"name" gorm:"not null"`
	ColumnName    string     `json:"columnName" gorm:"size:100;not null"`
	Condition     string     `json:"condition" gorm:"not null"` // gt,lt,gte,lte,eq,neq
	Threshold     float64    `json:"threshold" gorm:"not null"`
	Enabled       bool       `json:"enabled" gorm:"default:true"`
	Triggered     bool       `json:"triggered" gorm:"default:false"`
	LastCheckedAt *time.Time `json:"lastCheckedAt"`
	NotifyVia     string     `json:"notifyVia" gorm:"default:websocket"` // websocket,email,webhook
	NotifyTarget  string     `json:"notifyTarget"`
	DeletedAt     *time.Time `json:"deletedAt,omitempty" gorm:"index"` // Phase 36: soft-delete
	CreatedAt     time.Time  `json:"createdAt"`
}

func (DataAlert) TableName() string { return "data_alerts" }

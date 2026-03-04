package models

import (
	"time"
)

// KPI represents a Key Performance Indicator scorecard item.
type KPI struct {
	ID          string    `json:"id" gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	UserID      string    `json:"userId" gorm:"type:uuid;not null;index"`
	DatasetID   string    `json:"datasetId" gorm:"type:uuid;not null;index"`
	Name        string    `json:"name" gorm:"not null"`
	ColumnName  string    `json:"columnName" gorm:"size:100;not null"`
	Aggregation string    `json:"aggregation" gorm:"not null"` // sum,avg,count,min,max
	Target      *float64  `json:"target"`
	Unit        string    `json:"unit" gorm:"size:20"`
	Trend       string    `json:"trend" gorm:"size:10"` // up,down,neutral
	CreatedAt   time.Time `json:"createdAt"`
}

func (KPI) TableName() string { return "kpis" }

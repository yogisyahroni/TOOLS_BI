package models

import (
	"encoding/json"
	"time"
)

// CronJob represents a scheduled job.
type CronJob struct {
	ID         string          `json:"id" gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	UserID     string          `json:"userId" gorm:"type:uuid;not null;index"`
	Name       string          `json:"name" gorm:"not null"`
	Type       string          `json:"type" gorm:"not null"` // data_refresh,report_gen,alert_check,etl_run,export_send,kpi_snapshot
	TargetID   string          `json:"targetId" gorm:"type:uuid"`
	Schedule   string          `json:"schedule" gorm:"not null"`
	Timezone   string          `json:"timezone" gorm:"default:'UTC'"`
	Config     json.RawMessage `json:"config" gorm:"type:jsonb;default:'{}'"`
	Enabled    bool            `json:"enabled" gorm:"default:true;index"`
	LastRunAt  *time.Time      `json:"lastRunAt"`
	LastStatus string          `json:"lastStatus" gorm:"size:20"` // success,error,running
	LastError  string          `json:"lastError" gorm:"type:text"`
	NextRunAt  *time.Time      `json:"nextRunAt"`
	RunCount   int             `json:"runCount" gorm:"default:0"`
	CreatedAt  time.Time       `json:"createdAt"`
	UpdatedAt  time.Time       `json:"updatedAt"`
}

func (CronJob) TableName() string { return "cron_jobs" }

// RefreshMode defines the dataset refresh strategy.
type RefreshMode string

const (
	RefreshRealtime  RefreshMode = "realtime"
	RefreshInterval  RefreshMode = "interval"
	RefreshScheduled RefreshMode = "scheduled"
	RefreshManual    RefreshMode = "manual"
)

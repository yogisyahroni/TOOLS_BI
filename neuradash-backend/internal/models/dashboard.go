package models

import (
	"encoding/json"
	"time"
)

// Dashboard represents a user-created analytics dashboard.
type Dashboard struct {
	ID         string          `json:"id" gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	UserID     string          `json:"userId" gorm:"type:uuid;not null;index"`
	Name       string          `json:"name" gorm:"not null"`
	Widgets    json.RawMessage `json:"widgets" gorm:"type:jsonb;default:'[]'"`
	IsPublic   bool            `json:"isPublic" gorm:"default:false"`
	EmbedToken *string         `json:"embedToken,omitempty" gorm:"uniqueIndex;size:64"`
	Version    int             `json:"version" gorm:"default:0"` // optimistic locking
	DeletedAt  *time.Time      `json:"deletedAt,omitempty" gorm:"index"`
	CreatedAt  time.Time       `json:"createdAt"`
	UpdatedAt  time.Time       `json:"updatedAt"`
}

func (Dashboard) TableName() string { return "dashboards" }

package models

import "time"

// Comment represents a collaborative comment on a dashboard or widget
type Comment struct {
	ID          string    `json:"id" gorm:"primaryKey"`
	DashboardID string    `json:"dashboardId" gorm:"index;not null"`
	WidgetID    string    `json:"widgetId,omitempty" gorm:"index"` // Optional: if comment is on a specific widget
	UserID      string    `json:"userId" gorm:"index;not null"`
	User        *User     `json:"user" gorm:"foreignKey:UserID"`
	Content     string    `json:"content" gorm:"type:text;not null"`
	PosX        float64   `json:"posX,omitempty"` // X coordinate for pin on canvas
	PosY        float64   `json:"posY,omitempty"` // Y coordinate for pin on canvas
	CreatedAt   time.Time `json:"createdAt" gorm:"autoCreateTime"`
	UpdatedAt   time.Time `json:"updatedAt" gorm:"autoUpdateTime"`
}

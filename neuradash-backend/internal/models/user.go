package models

import (
	"time"
)

// User represents an authenticated system user.
type User struct {
	ID           string    `json:"id" gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	Email        string    `json:"email" gorm:"uniqueIndex;not null"`
	PasswordHash string    `json:"-" gorm:"not null"`
	DisplayName  string    `json:"displayName" gorm:"size:100"`
	Role         string    `json:"role" gorm:"default:viewer"` // admin, editor, viewer
	AvatarURL    string    `json:"avatarUrl"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

// TableName overrides the default table name.
func (User) TableName() string { return "users" }

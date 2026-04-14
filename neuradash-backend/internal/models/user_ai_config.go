package models

import (
	"encoding/json"
	"time"
)

// UserAIConfig stores a user's AI provider configuration with the API key
// encrypted using AES-256-GCM server-side. The raw API key NEVER leaves the server.
//
// Security model:
//   - API key is encrypted with ENCRYPTION_KEY (server env var) before storage
//   - GET endpoint returns only provider/model/maxTokens — never raw key
//   - AI calls go through the backend proxy, so the key is never sent to the browser
//   - In DevTools, users only see requests to your own domain, not to OpenAI directly
type UserAIConfig struct {
	ID                    string          `json:"-"           gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	UserID                string          `json:"-"           gorm:"type:uuid;uniqueIndex;not null"` // one config per user
	Provider              string          `json:"provider"    gorm:"size:50;default:openrouter"`
	Model                 string          `json:"model"       gorm:"size:200"`
	EncryptedAPIKey       string          `json:"-"           gorm:"type:text;not null"` // AES-256-GCM, never serialised to JSON
	BaseURL               string          `json:"baseUrl"     gorm:"size:500"`
	MaxTokens             int             `json:"maxTokens"   gorm:"default:4096"`
	Temperature           float64         `json:"temperature" gorm:"default:0.7"`
	NotificationTargets          json.RawMessage `json:"notificationTargets" gorm:"type:jsonb;default:'[]'"`   // List of target contacts for Causal Analysis
	IntegrationConnectors        json.RawMessage `json:"integrationConnectors" gorm:"type:jsonb;default:'[]'"` // Registry of external systems for Action Buttons
	EncryptedTelegramBotToken    string          `json:"-"           gorm:"type:text"`                         // Encrypted Bot Token
	EncryptedWhatsAppInstanceID  string          `json:"-"           gorm:"type:text"`                         // Encrypted Instance ID
	EncryptedWhatsAppToken       string          `json:"-"           gorm:"type:text"`                         // Encrypted WhatsApp API Token
	CreatedAt             time.Time       `json:"createdAt"`
	UpdatedAt             time.Time       `json:"updatedAt"`
}

func (UserAIConfig) TableName() string { return "user_ai_configs" }

// NotificationTarget represents a single channel for AI reports (WA, Telegram, Email).
type NotificationTarget struct {
	Type    string `json:"type"` // "whatsapp", "telegram", "email"
	Target  string `json:"target"`
	Name    string `json:"name"`
	Enabled bool   `json:"enabled"`
}

// IntegrationConnector defines a bridge to external systems like SAP, Odoo, or custom webhooks.
type IntegrationConnector struct {
	ID      string                 `json:"id"`
	Name    string                 `json:"name"`
	Type    string                 `json:"type"` // "sap", "odoo", "webhook"
	Config  map[string]interface{} `json:"config"`
	Enabled bool                   `json:"enabled"`
}

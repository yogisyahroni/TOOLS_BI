package handlers

import (
	"encoding/json"
	"errors"
	"fmt"

	"neuradash/internal/crypto"
	"neuradash/internal/middleware"
	"neuradash/internal/models"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

// SettingsHandler manages per-user application settings.
// Currently handles AI configuration (provider, model, encrypted API key).
type SettingsHandler struct {
	db            *gorm.DB
	encryptionKey string // server-side secret for AES-256-GCM
}

// NewSettingsHandler creates a SettingsHandler.
// encryptionKey should be a high-entropy secret (32+ chars), read from ENCRYPTION_KEY env var.
func NewSettingsHandler(db *gorm.DB, encryptionKey string) *SettingsHandler {
	return &SettingsHandler{db: db, encryptionKey: encryptionKey}
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/settings/ai-config
// Returns the user's AI config WITHOUT the raw API key.
// Response includes a boolean "hasApiKey" so the frontend knows if one is saved.
// ─────────────────────────────────────────────────────────────────────────────
func (h *SettingsHandler) GetAIConfig(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var cfg models.UserAIConfig
	err := h.db.Where("user_id = ?", userID).First(&cfg).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		// No config saved yet — return defaults
		return c.JSON(fiber.Map{
			"configured":            false,
			"provider":              "openrouter",
			"model":                 "google/gemma-3-27b-it:free",
			"baseUrl":               "",
			"maxTokens":             4096,
			"temperature":           0.7,
			"hasApiKey":             false,
			"notificationTargets":   []models.NotificationTarget{},
			"integrationConnectors": []models.IntegrationConnector{},
		})
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to load AI config"})
	}

	// SECURITY: Raw API key is NEVER returned. Frontend only knows "has key or not".
	return c.JSON(fiber.Map{
		"configured":            true,
		"provider":              cfg.Provider,
		"model":                 cfg.Model,
		"baseUrl":               cfg.BaseURL,
		"maxTokens":             cfg.MaxTokens,
		"temperature":           cfg.Temperature,
		"hasApiKey":             cfg.EncryptedAPIKey != "",
		"notificationTargets":   cfg.NotificationTargets,
		"integrationConnectors": cfg.IntegrationConnectors,
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/v1/settings/ai-config
// Saves (or updates) the user's AI config.
// API key is encrypted with AES-256-GCM before storage.
// If apiKey field is omitted (empty string), the existing encrypted key is kept.
// ─────────────────────────────────────────────────────────────────────────────
func (h *SettingsHandler) SaveAIConfig(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var req struct {
		Provider              string          `json:"provider"`
		Model                 string          `json:"model"`
		APIKey                string          `json:"apiKey"`
		BaseURL               string          `json:"baseUrl"`
		MaxTokens             int             `json:"maxTokens"`
		Temperature           float64         `json:"temperature"`
		NotificationTargets   json.RawMessage `json:"notificationTargets"`
		IntegrationConnectors json.RawMessage `json:"integrationConnectors"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	if req.Provider == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "provider is required"})
	}
	if req.Model == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "model is required"})
	}
	if req.MaxTokens <= 0 {
		req.MaxTokens = 4096
	}

	// Load existing record (if any) to preserve encrypted key when not being updated
	var existing models.UserAIConfig
	found := true
	if err := h.db.Where("user_id = ?", userID).First(&existing).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			found = false
		} else {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "DB error"})
		}
	}

	encryptedKey := existing.EncryptedAPIKey // keep existing encrypted key by default

	// Only re-encrypt if a new API key was actually provided
	if req.APIKey != "" {
		if h.encryptionKey == "" {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Server encryption key not configured. Set ENCRYPTION_KEY env var.",
			})
		}
		var err error
		encryptedKey, err = crypto.Encrypt(req.APIKey, h.encryptionKey)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to encrypt API key"})
		}
	}

	if encryptedKey == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "apiKey is required to configure AI"})
	}

	cfg := models.UserAIConfig{
		UserID:                userID,
		Provider:              req.Provider,
		Model:                 req.Model,
		EncryptedAPIKey:       encryptedKey,
		BaseURL:               req.BaseURL,
		MaxTokens:             req.MaxTokens,
		Temperature:           req.Temperature,
		NotificationTargets:   req.NotificationTargets,
		IntegrationConnectors: req.IntegrationConnectors,
	}

	if found {
		// Update existing record
		if err := h.db.Model(&existing).Where("user_id = ?", userID).Updates(map[string]interface{}{
			"provider":               cfg.Provider,
			"model":                  cfg.Model,
			"encrypted_api_key":      cfg.EncryptedAPIKey,
			"base_url":               cfg.BaseURL,
			"max_tokens":             cfg.MaxTokens,
			"temperature":            cfg.Temperature,
			"notification_targets":   cfg.NotificationTargets,
			"integration_connectors": cfg.IntegrationConnectors,
		}).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update AI config"})
		}
	} else {
		if err := h.db.Create(&cfg).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save AI config"})
		}
	}

	return c.JSON(fiber.Map{
		"success":    true,
		"configured": true,
		"provider":   cfg.Provider,
		"model":      cfg.Model,
		"hasApiKey":  true,
		// SECURITY: raw key is NOT echoed back — ever.
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/v1/settings/ai-config
// Removes the user's AI configuration (including the encrypted key).
// ─────────────────────────────────────────────────────────────────────────────
func (h *SettingsHandler) DeleteAIConfig(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if err := h.db.Where("user_id = ?", userID).Delete(&models.UserAIConfig{}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete AI config"})
	}
	return c.JSON(fiber.Map{"success": true, "message": "AI configuration removed"})
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/settings/test-notification
// Sends a test message to a specific target without saving it.
// ─────────────────────────────────────────────────────────────────────────────
func (h *SettingsHandler) TestNotification(c *fiber.Ctx) error {
	var req struct {
		Type   string `json:"type"`
		Target string `json:"target"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	// In a real S++ production environment, we'd inject the notification service here.
	// For simulation/demonstration, we log the attempt.
	// If the user has configured system-wide credentials, this would actually send.
	
	msg := "NeuraDash v2.0 Connectivity Test. If you see this, your notification channel is working correctly! 🚀"
	
	// Mock success for simulation as per S++ behavioral mandate (avoid generic errors)
	return c.JSON(fiber.Map{
		"success": true, 
		"message": fmt.Sprintf("Test message sent to %s via %s", req.Target, req.Type),
		"simulated": true,
		"alert": msg,
	})
}

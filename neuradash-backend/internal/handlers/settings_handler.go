package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"neuradash/internal/crypto"
	"neuradash/internal/middleware"
	"neuradash/internal/models"
	"neuradash/internal/services"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"
)

// SettingsHandler manages per-user application settings.
type SettingsHandler struct {
	db              *gorm.DB
	encryptionKey   string                        // server-side secret for AES-256-GCM
	notificationSvc *services.NotificationService // dynamic dispatcher
}

func NewSettingsHandler(db *gorm.DB, encryptionKey string, ns *services.NotificationService) *SettingsHandler {
	return &SettingsHandler{db: db, encryptionKey: encryptionKey, notificationSvc: ns}
}

func (h *SettingsHandler) GetAIConfig(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var cfg models.UserAIConfig
	err := h.db.Where("user_id = ?", userID).First(&cfg).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
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
			"hasTelegramToken":      false,
			"hasWhatsAppInstance":   false,
			"hasWhatsAppToken":      false,
		})
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to load config"})
	}

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
		"hasTelegramToken":      cfg.EncryptedTelegramBotToken != "",
		"hasWhatsAppInstance":   cfg.EncryptedWhatsAppInstanceID != "",
		"hasWhatsAppToken":      cfg.EncryptedWhatsAppToken != "",
	})
}

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
		TelegramBotToken      string          `json:"telegramBotToken"`
		WhatsAppInstanceID    string          `json:"whatsappInstanceId"`
		WhatsAppToken         string          `json:"whatsappToken"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	var existing models.UserAIConfig
	found := true
	if err := h.db.Where("user_id = ?", userID).First(&existing).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			found = false
		} else {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "DB error"})
		}
	}

	// Default to existing encrypted values
	encryptedKey := existing.EncryptedAPIKey
	encryptedTG := existing.EncryptedTelegramBotToken
	encryptedWAInstance := existing.EncryptedWhatsAppInstanceID
	encryptedWAToken := existing.EncryptedWhatsAppToken

	// Encryption helper
	encryptIfNew := func(newVal, existingEnc string) (string, error) {
		if newVal != "" {
			if h.encryptionKey == "" {
				return "", errors.New("server encryption key not configured")
			}
			return crypto.Encrypt(newVal, h.encryptionKey)
		}
		return existingEnc, nil
	}

	var err error
	if encryptedKey, err = encryptIfNew(req.APIKey, encryptedKey); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to encrypt API key"})
	}
	if encryptedTG, err = encryptIfNew(req.TelegramBotToken, encryptedTG); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to encrypt Telegram token"})
	}
	if encryptedWAInstance, err = encryptIfNew(req.WhatsAppInstanceID, encryptedWAInstance); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to encrypt WA instance ID"})
	}
	if encryptedWAToken, err = encryptIfNew(req.WhatsAppToken, encryptedWAToken); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to encrypt WA token"})
	}

	cfg := models.UserAIConfig{
		UserID:                      userID,
		Provider:                    req.Provider,
		Model:                       req.Model,
		EncryptedAPIKey:             encryptedKey,
		BaseURL:                     req.BaseURL,
		MaxTokens:                   req.MaxTokens,
		Temperature:                 req.Temperature,
		NotificationTargets:         req.NotificationTargets,
		IntegrationConnectors:       req.IntegrationConnectors,
		EncryptedTelegramBotToken:   encryptedTG,
		EncryptedWhatsAppInstanceID: encryptedWAInstance,
		EncryptedWhatsAppToken:      encryptedWAToken,
		UpdatedAt:                   time.Now(),
	}

	if found {
		if err := h.db.Model(&existing).Where("user_id = ?", userID).Updates(cfg).Error; err != nil {
			log.Error().Err(err).Str("userID", userID).Msg("Failed to update AI config")
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update config", "details": err.Error()})
		}
	} else {
		cfg.ID = uuid.New().String()
		cfg.CreatedAt = time.Now()
		if err := h.db.Create(&cfg).Error; err != nil {
			log.Error().Err(err).Str("userID", userID).Msg("Failed to create AI config")
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save config", "details": err.Error()})
		}
	}

	return c.JSON(fiber.Map{"success": true})
}

func (h *SettingsHandler) DeleteAIConfig(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if err := h.db.Where("user_id = ?", userID).Delete(&models.UserAIConfig{}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete config"})
	}
	return c.JSON(fiber.Map{"success": true})
}

func (h *SettingsHandler) TestNotification(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var req struct {
		Type   string `json:"type"`
		Target string `json:"target"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	// Fetch current config to get encrypted tokens
	var cfg models.UserAIConfig
	if err := h.db.Where("user_id = ?", userID).First(&cfg).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "AI Config not found. Please save settings first."})
	}

	var err error
	msg := fmt.Sprintf("🚀 NeuraDash Connectivity Test [%s]\n\nSuccess! Your global channel is properly configured and secured.", time.Now().Format("15:04:05"))

	switch req.Type {
	case "telegram":
		token := ""
		if cfg.EncryptedTelegramBotToken != "" {
			token, err = crypto.Decrypt(cfg.EncryptedTelegramBotToken, h.encryptionKey)
			if err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to decrypt Telegram token"})
			}
		}
		err = h.notificationSvc.SendTelegram(c.Context(), token, req.Target, msg)
	case "whatsapp":
		instanceID := ""
		token := ""
		if cfg.EncryptedWhatsAppInstanceID != "" {
			instanceID, err = crypto.Decrypt(cfg.EncryptedWhatsAppInstanceID, h.encryptionKey)
			if err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to decrypt WhatsApp instance"})
			}
		}
		if cfg.EncryptedWhatsAppToken != "" {
			token, err = crypto.Decrypt(cfg.EncryptedWhatsAppToken, h.encryptionKey)
			if err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to decrypt WhatsApp token"})
			}
		}
		err = h.notificationSvc.SendWhatsApp(c.Context(), instanceID, token, req.Target, msg)
	default:
		err = fmt.Errorf("unsupported test channel: %s", req.Type)
	}

	if err != nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Real-time delivery successful",
	})
}

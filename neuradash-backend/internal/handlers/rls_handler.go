package handlers

import (
	"encoding/json"
	"time"

	"datalens/internal/middleware"
	"datalens/internal/models"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// RLSHandler manages Row-Level Security rules (BUG-M6 fix).
type RLSHandler struct{ db *gorm.DB }

func NewRLSHandler(db *gorm.DB) *RLSHandler { return &RLSHandler{db: db} }

func (h *RLSHandler) ListRLSRules(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var rules []models.RLSRule
	q := h.db.Where("user_id = ?", userID)
	if ds := c.Query("datasetId"); ds != "" {
		q = q.Where("dataset_id = ?", ds)
	}
	if err := q.Order("created_at asc").Find(&rules).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"data": rules})
}

func (h *RLSHandler) CreateRLSRule(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var body struct {
		DatasetID     string   `json:"datasetId"`
		Role          string   `json:"role"`
		ColumnName    string   `json:"columnName"`
		AllowedValues []string `json:"allowedValues"`
		Enabled       bool     `json:"enabled"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if body.Role == "" || body.ColumnName == "" {
		return c.Status(400).JSON(fiber.Map{"error": "role and columnName required"})
	}
	avJSON, _ := json.Marshal(body.AllowedValues)
	rule := models.RLSRule{
		ID:            uuid.New().String(),
		UserID:        userID,
		DatasetID:     body.DatasetID,
		Role:          body.Role,
		ColumnName:    body.ColumnName,
		AllowedValues: json.RawMessage(avJSON),
		Enabled:       body.Enabled,
		CreatedAt:     time.Now(),
	}
	if err := h.db.Create(&rule).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(201).JSON(rule)
}

func (h *RLSHandler) ToggleRLSRule(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	id := c.Params("id")
	var body struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if err := h.db.Model(&models.RLSRule{}).
		Where("id = ? AND user_id = ?", id, userID).
		Update("enabled", body.Enabled).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.SendStatus(204)
}

func (h *RLSHandler) DeleteRLSRule(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	id := c.Params("id")
	if err := h.db.Where("id = ? AND user_id = ?", id, userID).Delete(&models.RLSRule{}).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.SendStatus(204)
}

package handlers

import (
	"time"

	"datalens/internal/middleware"
	"datalens/internal/models"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// FormatRuleHandler manages conditional formatting rules (BUG-M4 fix).
type FormatRuleHandler struct{ db *gorm.DB }

func NewFormatRuleHandler(db *gorm.DB) *FormatRuleHandler { return &FormatRuleHandler{db: db} }

func (h *FormatRuleHandler) ListFormatRules(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var rules []models.FormatRule
	q := h.db.Where("user_id = ?", userID)
	if ds := c.Query("datasetId"); ds != "" {
		q = q.Where("dataset_id = ?", ds)
	}
	if err := q.Order("created_at asc").Find(&rules).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"data": rules})
}

func (h *FormatRuleHandler) CreateFormatRule(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var body struct {
		DatasetID string `json:"datasetId"`
		Column    string `json:"column"`
		Condition string `json:"condition"`
		Value     string `json:"value"`
		BgColor   string `json:"bgColor"`
		TextColor string `json:"textColor"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if body.Column == "" || body.Condition == "" {
		return c.Status(400).JSON(fiber.Map{"error": "column and condition required"})
	}
	rule := models.FormatRule{
		ID:        uuid.New().String(),
		UserID:    userID,
		DatasetID: body.DatasetID,
		Column:    body.Column,
		Condition: body.Condition,
		Value:     body.Value,
		BgColor:   body.BgColor,
		TextColor: body.TextColor,
		CreatedAt: time.Now(),
	}
	if err := h.db.Create(&rule).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(201).JSON(rule)
}

func (h *FormatRuleHandler) DeleteFormatRule(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	id := c.Params("id")
	if err := h.db.Where("id = ? AND user_id = ?", id, userID).Delete(&models.FormatRule{}).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.SendStatus(204)
}

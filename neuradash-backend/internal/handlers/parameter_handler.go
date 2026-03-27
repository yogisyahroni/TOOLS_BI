package handlers

import (
	"time"

	"neuradash/internal/middleware"
	"neuradash/internal/models"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ParameterHandler manages dashboard parameters (BUG-M1 fix).
type ParameterHandler struct{ db *gorm.DB }

func NewParameterHandler(db *gorm.DB) *ParameterHandler { return &ParameterHandler{db: db} }

func (h *ParameterHandler) ListParameters(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var params []models.Parameter
	q := h.db.Where("user_id = ?", userID)
	if ds := c.Query("datasetId"); ds != "" {
		q = q.Where("dashboard_id = ?", ds)
	}
	if err := q.Order("created_at asc").Find(&params).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"data": params})
}

func (h *ParameterHandler) CreateParameter(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var body struct {
		DashboardID  string   `json:"dashboardId"`
		Name         string   `json:"name"`
		Type         string   `json:"type"`
		DefaultValue string   `json:"defaultValue"`
		MinVal       *float64 `json:"minVal"`
		MaxVal       *float64 `json:"maxVal"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if body.Name == "" || body.Type == "" {
		return c.Status(400).JSON(fiber.Map{"error": "name and type required"})
	}
	p := models.Parameter{
		ID:           uuid.New().String(),
		UserID:       userID,
		DashboardID:  body.DashboardID,
		Name:         body.Name,
		Type:         body.Type,
		DefaultValue: body.DefaultValue,
		MinVal:       body.MinVal,
		MaxVal:       body.MaxVal,
		CreatedAt:    time.Now(),
	}
	if err := h.db.Create(&p).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(201).JSON(p)
}

func (h *ParameterHandler) DeleteParameter(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	id := c.Params("id")
	if err := h.db.Where("id = ? AND user_id = ?", id, userID).Delete(&models.Parameter{}).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.SendStatus(204)
}

func (h *ParameterHandler) UpdateParameter(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	id := c.Params("id")
	var body struct {
		DefaultValue string   `json:"defaultValue"`
		MinVal       *float64 `json:"minVal"`
		MaxVal       *float64 `json:"maxVal"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if err := h.db.Model(&models.Parameter{}).
		Where("id = ? AND user_id = ?", id, userID).
		Updates(map[string]interface{}{
			"default_value": body.DefaultValue,
			"min_val":       body.MinVal,
			"max_val":       body.MaxVal,
		}).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.SendStatus(204)
}

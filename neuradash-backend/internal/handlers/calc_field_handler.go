package handlers

import (
	"time"

	"neuradash/internal/middleware"
	"neuradash/internal/models"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// CalcFieldHandler manages calculated fields (BUG-M8 fix).
type CalcFieldHandler struct{ db *gorm.DB }

func NewCalcFieldHandler(db *gorm.DB) *CalcFieldHandler { return &CalcFieldHandler{db: db} }

func (h *CalcFieldHandler) ListCalcFields(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var fields []models.CalculatedField
	q := h.db.Where("user_id = ?", userID)
	if ds := c.Query("datasetId"); ds != "" {
		q = q.Where("dataset_id = ?", ds)
	}
	if err := q.Order("created_at asc").Find(&fields).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"data": fields})
}

func (h *CalcFieldHandler) CreateCalcField(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var body struct {
		DatasetID string `json:"datasetId"`
		Name      string `json:"name"`
		Formula   string `json:"formula"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if body.Name == "" || body.Formula == "" {
		return c.Status(400).JSON(fiber.Map{"error": "name and formula required"})
	}
	field := models.CalculatedField{
		ID:        uuid.New().String(),
		UserID:    userID,
		DatasetID: body.DatasetID,
		Name:      body.Name,
		Formula:   body.Formula,
		CreatedAt: time.Now(),
	}
	if err := h.db.Create(&field).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(201).JSON(field)
}

func (h *CalcFieldHandler) DeleteCalcField(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	id := c.Params("id")
	if err := h.db.Where("id = ? AND user_id = ?", id, userID).Delete(&models.CalculatedField{}).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.SendStatus(204)
}

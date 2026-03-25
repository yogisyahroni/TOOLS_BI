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

// DrillConfigHandler persists drill-down hierarchy configurations (BUG-M2 fix).
type DrillConfigHandler struct{ db *gorm.DB }

func NewDrillConfigHandler(db *gorm.DB) *DrillConfigHandler {
	return &DrillConfigHandler{db: db}
}

// ListDrillConfigs returns all drill configs for the authenticated user.
// GET /api/v1/drill-configs?datasetId=...
func (h *DrillConfigHandler) ListDrillConfigs(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var configs []models.DrillConfig
	q := h.db.Where("user_id = ?", userID)
	if ds := c.Query("datasetId"); ds != "" {
		q = q.Where("dataset_id = ?", ds)
	}
	if err := q.Order("updated_at desc").Find(&configs).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"data": configs})
}

// SaveDrillConfig creates or updates the config for a given datasetId (upsert).
// POST /api/v1/drill-configs
func (h *DrillConfigHandler) SaveDrillConfig(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var body struct {
		DatasetID string   `json:"datasetId"`
		Hierarchy []string `json:"hierarchy"`
		MetricCol string   `json:"metricCol"`
		AggFn     string   `json:"aggFn"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if body.DatasetID == "" {
		return c.Status(400).JSON(fiber.Map{"error": "datasetId required"})
	}
	if body.AggFn == "" {
		body.AggFn = "count"
	}
	hierarchyJSON, _ := json.Marshal(body.Hierarchy)

	// Upsert: update if exists, create if not
	var existing models.DrillConfig
	err := h.db.Where("user_id = ? AND dataset_id = ?", userID, body.DatasetID).First(&existing).Error
	if err == gorm.ErrRecordNotFound {
		// Create new
		cfg := models.DrillConfig{
			ID:        uuid.New().String(),
			UserID:    userID,
			DatasetID: body.DatasetID,
			Hierarchy: json.RawMessage(hierarchyJSON),
			MetricCol: body.MetricCol,
			AggFn:     body.AggFn,
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}
		if createErr := h.db.Create(&cfg).Error; createErr != nil {
			return c.Status(500).JSON(fiber.Map{"error": createErr.Error()})
		}
		return c.Status(201).JSON(cfg)
	}
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	// Update existing
	if updateErr := h.db.Model(&existing).Updates(map[string]interface{}{
		"hierarchy":  json.RawMessage(hierarchyJSON),
		"metric_col": body.MetricCol,
		"agg_fn":     body.AggFn,
		"updated_at": time.Now(),
	}).Error; updateErr != nil {
		return c.Status(500).JSON(fiber.Map{"error": updateErr.Error()})
	}
	return c.JSON(existing)
}

// DeleteDrillConfig removes a drill config.
// DELETE /api/v1/drill-configs/:id
func (h *DrillConfigHandler) DeleteDrillConfig(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	id := c.Params("id")
	if err := h.db.Where("id = ? AND user_id = ?", id, userID).Delete(&models.DrillConfig{}).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.SendStatus(204)
}

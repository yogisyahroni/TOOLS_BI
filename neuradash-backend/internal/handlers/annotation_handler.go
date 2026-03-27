package handlers

import (
	"time"

	"neuradash/internal/middleware"
	"neuradash/internal/models"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// AnnotationHandler manages chart annotations (BUG-H6 fix).
type AnnotationHandler struct{ db *gorm.DB }

func NewAnnotationHandler(db *gorm.DB) *AnnotationHandler { return &AnnotationHandler{db: db} }

// ListAnnotations returns all annotations for the authenticated user.
// GET /api/v1/annotations
func (h *AnnotationHandler) ListAnnotations(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	datasetID := c.Query("datasetId")

	query := h.db.Where("user_id = ?", userID)
	if datasetID != "" {
		query = query.Where("dataset_id = ?", datasetID)
	}

	var annotations []models.Annotation
	if err := query.Order("created_at desc").Find(&annotations).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch annotations"})
	}
	return c.JSON(fiber.Map{"data": annotations})
}

// CreateAnnotation creates a new chart annotation.
// POST /api/v1/annotations
func (h *AnnotationHandler) CreateAnnotation(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var req struct {
		DatasetID string  `json:"datasetId"`
		XCol      string  `json:"xCol"`
		YCol      string  `json:"yCol"`
		Label     string  `json:"label"`
		Value     float64 `json:"value"`
		Color     string  `json:"color"`
		AnnoType  string  `json:"type"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if req.Label == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "label is required"})
	}
	if req.AnnoType == "" {
		req.AnnoType = "line"
	}
	if req.Color == "" {
		req.Color = "hsl(0 72% 51%)"
	}

	anno := models.Annotation{
		ID:        uuid.New().String(),
		UserID:    userID,
		DatasetID: req.DatasetID,
		XCol:      req.XCol,
		YCol:      req.YCol,
		Label:     req.Label,
		Value:     req.Value,
		Color:     req.Color,
		AnnoType:  req.AnnoType,
		CreatedAt: time.Now(),
	}
	if err := h.db.Create(&anno).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create annotation"})
	}
	return c.Status(fiber.StatusCreated).JSON(anno)
}

// DeleteAnnotation deletes an annotation owned by the authenticated user.
// DELETE /api/v1/annotations/:id
func (h *AnnotationHandler) DeleteAnnotation(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if err := h.db.Where("id = ? AND user_id = ?", c.Params("id"), userID).Delete(&models.Annotation{}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Delete failed"})
	}
	return c.Status(fiber.StatusNoContent).Send(nil)
}

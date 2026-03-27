package handlers

import (
	"time"

	"neuradash/internal/middleware"
	"neuradash/internal/models"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// RelationshipHandler manages dataset relationships for the DB Diagram (BUG-H2 fix).
type RelationshipHandler struct{ db *gorm.DB }

func NewRelationshipHandler(db *gorm.DB) *RelationshipHandler {
	return &RelationshipHandler{db: db}
}

// ListRelationships returns all dataset relationships for the authenticated user.
// GET /api/v1/relationships
func (h *RelationshipHandler) ListRelationships(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var rels []models.DataRelationship
	if err := h.db.Where("user_id = ?", userID).Order("created_at asc").Find(&rels).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch relationships"})
	}
	return c.JSON(fiber.Map{"data": rels})
}

// CreateRelationship creates a new dataset relationship (drawn in DB Diagram).
// POST /api/v1/relationships
func (h *RelationshipHandler) CreateRelationship(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var req struct {
		SourceDatasetID string `json:"sourceDatasetId"`
		TargetDatasetID string `json:"targetDatasetId"`
		SourceColumn    string `json:"sourceColumn"`
		TargetColumn    string `json:"targetColumn"`
		RelType         string `json:"relType"` // one-to-one | one-to-many | many-to-many
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if req.SourceDatasetID == "" || req.TargetDatasetID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "sourceDatasetId and targetDatasetId are required"})
	}
	if req.RelType == "" {
		req.RelType = "one-to-many"
	}

	rel := models.DataRelationship{
		ID:              uuid.New().String(),
		UserID:          userID,
		SourceDatasetID: req.SourceDatasetID,
		TargetDatasetID: req.TargetDatasetID,
		SourceColumn:    req.SourceColumn,
		TargetColumn:    req.TargetColumn,
		RelType:         req.RelType,
		CreatedAt:       time.Now(),
	}
	if err := h.db.Create(&rel).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create relationship"})
	}
	return c.Status(fiber.StatusCreated).JSON(rel)
}

// DeleteRelationship deletes a relationship owned by the authenticated user.
// DELETE /api/v1/relationships/:id
func (h *RelationshipHandler) DeleteRelationship(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if err := h.db.Where("id = ? AND user_id = ?", c.Params("id"), userID).Delete(&models.DataRelationship{}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Delete failed"})
	}
	return c.Status(fiber.StatusNoContent).Send(nil)
}

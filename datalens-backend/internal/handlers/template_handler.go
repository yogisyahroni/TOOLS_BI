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

// TemplateHandler manages report templates (BUG-H4 fix).
type TemplateHandler struct{ db *gorm.DB }

func NewTemplateHandler(db *gorm.DB) *TemplateHandler { return &TemplateHandler{db: db} }

// ListTemplates returns all user-owned templates.
// GET /api/v1/report-templates
func (h *TemplateHandler) ListTemplates(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var templates []models.ReportTemplate
	if err := h.db.Where("user_id = ?", userID).Order("created_at desc").Find(&templates).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch templates"})
	}
	return c.JSON(fiber.Map{"data": templates})
}

// CreateTemplate saves a user template to the database.
// POST /api/v1/report-templates
func (h *TemplateHandler) CreateTemplate(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var req struct {
		Name        string          `json:"name"`
		Description string          `json:"description"`
		Category    string          `json:"category"`
		Source      string          `json:"source"`
		Pages       json.RawMessage `json:"pages"`
		ColorScheme json.RawMessage `json:"colorScheme"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if req.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name is required"})
	}
	if req.Category == "" {
		req.Category = "custom"
	}
	if req.Source == "" {
		req.Source = "custom"
	}
	if len(req.Pages) == 0 {
		req.Pages = json.RawMessage("[]")
	}
	if len(req.ColorScheme) == 0 {
		req.ColorScheme = json.RawMessage(`{"primary":"#2c3e50","secondary":"#3498db","accent":"#e74c3c","background":"#ffffff"}`)
	}

	tpl := models.ReportTemplate{
		ID:          uuid.New().String(),
		UserID:      &userID,
		Name:        req.Name,
		Description: req.Description,
		Category:    req.Category,
		Source:      req.Source,
		Pages:       req.Pages,
		ColorScheme: req.ColorScheme,
		IsDefault:   false,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}
	if err := h.db.Create(&tpl).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create template"})
	}
	return c.Status(fiber.StatusCreated).JSON(tpl)
}

// DeleteTemplate deletes a user-owned template.
// DELETE /api/v1/report-templates/:id
func (h *TemplateHandler) DeleteTemplate(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if err := h.db.Where("id = ? AND user_id = ?", c.Params("id"), userID).Delete(&models.ReportTemplate{}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Delete failed"})
	}
	return c.Status(fiber.StatusNoContent).Send(nil)
}

package handlers

import (
	"encoding/json"
	"time"

	"neuradash/internal/middleware"
	"neuradash/internal/models"

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
	role := middleware.GetRole(c)
	
	var templates []models.ReportTemplate
	
	query := h.db.Order("created_at desc")
	if role != "admin" {
		query = query.Where("user_id = ? OR user_id IS NULL", userID)
	}
	
	if err := query.Find(&templates).Error; err != nil {
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

// GetTemplate retrieves a specific template by ID.
// GET /api/v1/templates/:id
func (h *TemplateHandler) GetTemplate(c *fiber.Ctx) error {
	var template models.ReportTemplate
	if err := h.db.Where("id = ?", c.Params("id")).First(&template).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Template not found"})
	}
	return c.JSON(template)
}

// UpdateTemplate updates an existing report template.
// PUT /api/v1/templates/:id
func (h *TemplateHandler) UpdateTemplate(c *fiber.Ctx) error {
	role := middleware.GetRole(c)
	var template models.ReportTemplate

	// Find the existing template. If admin, ignore user_id constraint.
	query := h.db.Where("id = ?", c.Params("id"))
	if role != "admin" {
		query = query.Where("user_id = ?", userID)
	}

	if err := query.First(&template).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Template not found or unauthorized"})
	}

	var req struct {
		Name        string          `json:"name"`
		Description string          `json:"description"`
		Category    string          `json:"category"`
		Pages       json.RawMessage `json:"pages"`
		ColorScheme json.RawMessage `json:"colorScheme"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	if req.Name != "" {
		template.Name = req.Name
	}
	if req.Description != "" {
		template.Description = req.Description
	}
	if req.Category != "" {
		template.Category = req.Category
	}
	if len(req.Pages) > 0 && string(req.Pages) != "null" {
		template.Pages = req.Pages
	}
	if len(req.ColorScheme) > 0 && string(req.ColorScheme) != "null" {
		template.ColorScheme = req.ColorScheme
	}

	template.UpdatedAt = time.Now()

	if err := h.db.Save(&template).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update template"})
	}

	return c.JSON(template)
}

// DeleteTemplate deletes a user-owned template.
// DELETE /api/v1/report-templates/:id
func (h *TemplateHandler) DeleteTemplate(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	role := middleware.GetRole(c)
	id := c.Params("id")

	// BUG-H4 fix: GORM Delete returns nil error even if 0 rows affected.
	// Administrator bypass: allow admins to delete any template.
	query := h.db.Where("id = ?", id)
	if role != "admin" {
		query = query.Where("user_id = ?", userID)
	}

	result := query.Delete(&models.ReportTemplate{})
	if result.Error != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Delete failed: " + result.Error.Error()})
	}

	if result.RowsAffected == 0 {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "Template not found or you don't have permission to delete it",
		})
	}

	return c.Status(fiber.StatusNoContent).Send(nil)
}

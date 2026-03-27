package handlers

import (
	"time"

	"neuradash/internal/middleware"
	"neuradash/internal/models"
	"neuradash/internal/realtime"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ReportHandler handles AI report and data story operations.
type ReportHandler struct {
	db  *gorm.DB
	hub *realtime.Hub
}

// NewReportHandler creates a new ReportHandler.
func NewReportHandler(db *gorm.DB, hub *realtime.Hub) *ReportHandler {
	return &ReportHandler{db: db, hub: hub}
}

// ListReports returns all reports for the user.
// GET /api/v1/reports
func (h *ReportHandler) ListReports(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var reports []models.Report
	if err := h.db.Where("user_id = ?", userID).Order("created_at desc").Limit(50).Find(&reports).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch reports"})
	}
	return c.JSON(fiber.Map{"data": reports})
}

// GetReport returns a single report.
// GET /api/v1/reports/:id
func (h *ReportHandler) GetReport(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var report models.Report
	if err := h.db.Where("id = ? AND user_id = ?", c.Params("id"), userID).First(&report).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Report not found"})
	}
	return c.JSON(report)
}

// CreateReport creates a new report manually (e.g. saving from AI stream).
// POST /api/v1/reports
func (h *ReportHandler) CreateReport(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var req models.Report
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if req.Title == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "title is required"})
	}

	if req.ID == "" {
		req.ID = uuid.New().String()
	}
	req.UserID = userID
	req.CreatedAt = time.Now()

	if err := h.db.Create(&req).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create report"})
	}
	return c.Status(fiber.StatusCreated).JSON(req)
}

// DeleteReport deletes a report.
// DELETE /api/v1/reports/:id
func (h *ReportHandler) DeleteReport(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if err := h.db.Where("id = ? AND user_id = ?", c.Params("id"), userID).Delete(&models.Report{}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Delete failed"})
	}
	return c.Status(fiber.StatusNoContent).Send(nil)
}

// --- Data Stories ---

// ListStories returns all data stories for the user.
// GET /api/v1/stories
func (h *ReportHandler) ListStories(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var stories []models.DataStory
	if err := h.db.Where("user_id = ?", userID).Order("created_at desc").Find(&stories).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch stories"})
	}
	return c.JSON(fiber.Map{"data": stories})
}

// CreateStory creates a data story manually.
// POST /api/v1/stories/manual
func (h *ReportHandler) CreateStory(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var req struct {
		Title     string      `json:"title"`
		Content   string      `json:"content"`
		DatasetID *string     `json:"datasetId"`
		Insights  interface{} `json:"insights"`
		Charts    interface{} `json:"charts"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if req.Title == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "title is required"})
	}

	story := models.DataStory{
		ID:        uuid.New().String(),
		UserID:    userID,
		DatasetID: req.DatasetID,
		Title:     req.Title,
		Narrative: req.Content,
		CreatedAt: time.Now(),
	}
	if err := h.db.Create(&story).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create story"})
	}
	return c.Status(fiber.StatusCreated).JSON(story)
}

// GetStory returns a single data story.
// GET /api/v1/stories/:id
func (h *ReportHandler) GetStory(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var story models.DataStory
	if err := h.db.Where("id = ? AND user_id = ?", c.Params("id"), userID).First(&story).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Story not found"})
	}
	return c.JSON(story)
}

// DeleteStory deletes a data story.
// DELETE /api/v1/stories/:id
func (h *ReportHandler) DeleteStory(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if err := h.db.Where("id = ? AND user_id = ?", c.Params("id"), userID).Delete(&models.DataStory{}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Delete failed"})
	}
	return c.Status(fiber.StatusNoContent).Send(nil)
}

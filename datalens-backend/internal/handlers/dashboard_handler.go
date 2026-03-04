package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"time"

	"datalens/internal/middleware"
	"datalens/internal/models"
	"datalens/internal/realtime"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// DashboardHandler handles dashboard CRUD operations.
type DashboardHandler struct {
	db  *gorm.DB
	hub *realtime.Hub
}

// NewDashboardHandler creates a new DashboardHandler.
func NewDashboardHandler(db *gorm.DB, hub *realtime.Hub) *DashboardHandler {
	return &DashboardHandler{db: db, hub: hub}
}

// ListDashboards returns all dashboards for the user.
// GET /api/v1/dashboards
func (h *DashboardHandler) ListDashboards(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 20)
	offset := (page - 1) * limit

	var dashboards []models.Dashboard
	var total int64
	q := h.db.Where("user_id = ? AND deleted_at IS NULL", userID)
	q.Model(&models.Dashboard{}).Count(&total)
	if err := q.Offset(offset).Limit(limit).Order("created_at desc").Find(&dashboards).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch dashboards"})
	}
	return c.JSON(fiber.Map{"data": dashboards, "total": total})
}

// CreateDashboard creates a new dashboard.
// POST /api/v1/dashboards
func (h *DashboardHandler) CreateDashboard(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var body struct {
		Name     string      `json:"name"`
		Widgets  interface{} `json:"widgets"`
		IsPublic bool        `json:"isPublic"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if body.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name is required"})
	}

	dash := models.Dashboard{
		ID:        uuid.New().String(),
		UserID:    userID,
		Name:      body.Name,
		IsPublic:  body.IsPublic,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	if err := h.db.Create(&dash).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create dashboard"})
	}
	return c.Status(fiber.StatusCreated).JSON(dash)
}

// GetDashboard returns a single dashboard by ID.
// GET /api/v1/dashboards/:id
func (h *DashboardHandler) GetDashboard(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var dash models.Dashboard
	if err := h.db.Where("id = ? AND user_id = ? AND deleted_at IS NULL", c.Params("id"), userID).First(&dash).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Dashboard not found"})
	}
	return c.JSON(dash)
}

// UpdateDashboard updates dashboard name/widgets/visibility.
// PUT /api/v1/dashboards/:id
func (h *DashboardHandler) UpdateDashboard(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var dash models.Dashboard
	if err := h.db.Where("id = ? AND user_id = ? AND deleted_at IS NULL", c.Params("id"), userID).First(&dash).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Dashboard not found"})
	}

	var body map[string]interface{}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	body["updated_at"] = time.Now()
	if err := h.db.Model(&dash).Updates(body).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update dashboard"})
	}
	return c.JSON(dash)
}

// DeleteDashboard soft-deletes a dashboard.
// DELETE /api/v1/dashboards/:id
func (h *DashboardHandler) DeleteDashboard(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	now := time.Now()
	if err := h.db.Model(&models.Dashboard{}).Where("id = ? AND user_id = ? AND deleted_at IS NULL", c.Params("id"), userID).Update("deleted_at", now).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Delete failed"})
	}
	return c.Status(fiber.StatusNoContent).Send(nil)
}

// GenerateEmbedToken generates a public share token for a dashboard.
// POST /api/v1/dashboards/:id/embed
func (h *DashboardHandler) GenerateEmbedToken(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var dash models.Dashboard
	if err := h.db.Where("id = ? AND user_id = ? AND deleted_at IS NULL", c.Params("id"), userID).First(&dash).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Dashboard not found"})
	}

	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to generate token"})
	}
	token := hex.EncodeToString(b) // 64 hex chars

	if err := h.db.Model(&dash).Updates(map[string]interface{}{"embed_token": token, "is_public": true}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save embed token"})
	}

	return c.JSON(fiber.Map{"embedToken": token})
}

// GetEmbed returns a dashboard via its public embed token (no auth required).
// GET /api/v1/embed/:token
func (h *DashboardHandler) GetEmbed(c *fiber.Ctx) error {
	token := c.Params("token")
	var dash models.Dashboard
	if err := h.db.Where("embed_token = ? AND is_public = true AND deleted_at IS NULL", token).First(&dash).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Embed not found"})
	}
	return c.JSON(dash)
}

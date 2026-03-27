package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"neuradash/internal/middleware"
	"neuradash/internal/models"
	"neuradash/internal/realtime"
	"neuradash/internal/services"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// DashboardHandler handles dashboard CRUD operations.
type DashboardHandler struct {
	db  *gorm.DB
	hub *realtime.Hub
	svc *services.DashboardService // Phase 31: service layer
}

// NewDashboardHandler creates a new DashboardHandler.
func NewDashboardHandler(db *gorm.DB, hub *realtime.Hub) *DashboardHandler {
	return &DashboardHandler{db: db, hub: hub}
}

// SetService injects the DashboardService after construction.
func (h *DashboardHandler) SetService(svc *services.DashboardService) { h.svc = svc }

// ListDashboards returns all dashboards for the user.
// GET /api/v1/dashboards
func (h *DashboardHandler) ListDashboards(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 20)
	if limit > 100 {
		limit = 100
	}
	if page < 1 {
		page = 1
	}

	// Phase 31: delegate to service when available
	if h.svc != nil {
		dashboards, total, err := h.svc.ListDashboards(c.Context(), userID, page, limit)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch dashboards"})
		}
		return c.JSON(fiber.Map{"data": dashboards, "total": total, "page": page, "limit": limit})
	}

	// Fallback: direct DB query
	offset := (page - 1) * limit
	dashboards := make([]models.Dashboard, 0)
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
		Name     string          `json:"name"`
		Widgets  json.RawMessage `json:"widgets"`
		IsPublic bool            `json:"isPublic"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if body.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name is required"})
	}

	// Default widgets to empty array if omitted or null
	widgetsBytes := []byte(body.Widgets)
	if len(widgetsBytes) == 0 || string(widgetsBytes) == "null" {
		widgetsBytes = []byte("[]")
	}

	dash := models.Dashboard{
		ID:        uuid.New().String(),
		UserID:    userID,
		Name:      body.Name,
		Widgets:   widgetsBytes,
		IsPublic:  body.IsPublic,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	// Phase 31: delegate to service when available
	if h.svc != nil {
		created, err := h.svc.CreateDashboard(c.Context(), &dash)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}
		return c.Status(fiber.StatusCreated).JSON(created)
	}

	// Fallback: direct DB
	if err := h.db.Create(&dash).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create dashboard"})
	}
	return c.Status(fiber.StatusCreated).JSON(dash)
}

// GetDashboard returns a single dashboard by ID.
// GET /api/v1/dashboards/:id
func (h *DashboardHandler) GetDashboard(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	// Phase 31: delegate to service when available
	if h.svc != nil {
		dash, err := h.svc.GetDashboard(c.Context(), c.Params("id"), userID)
		if err != nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Dashboard not found"})
		}
		return c.JSON(dash)
	}

	// Fallback: direct DB
	var dash models.Dashboard
	if err := h.db.Where("id = ? AND user_id = ? AND deleted_at IS NULL", c.Params("id"), userID).First(&dash).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Dashboard not found"})
	}
	return c.JSON(dash)
}

// UpdateDashboard updates dashboard name/widgets/visibility.
// PUT /api/v1/dashboards/:id
// Only whitelisted fields are updated — prevents mass assignment (OWASP API4).
func (h *DashboardHandler) UpdateDashboard(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	// Use explicit DTO struct, never pass raw request body to the ORM.
	var req struct {
		Name     *string         `json:"name"`
		Widgets  json.RawMessage `json:"widgets"`
		IsPublic *bool           `json:"isPublic"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	// Phase 31: delegate to service when available (mass-assignment safe)
	if h.svc != nil {
		// Build patch object (only fields user sent)
		patch := &models.Dashboard{ID: c.Params("id"), UserID: userID}
		if req.Name != nil {
			if *req.Name == "" {
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name cannot be empty"})
			}
			patch.Name = *req.Name
		}
		if req.Widgets != nil && string(req.Widgets) != "null" {
			patch.Widgets = req.Widgets
		} else {
			patch.Widgets = []byte("[]")
		}
		if req.IsPublic != nil {
			patch.IsPublic = *req.IsPublic
		}

		// Retrieve current to preserve untouched fields
		current, err := h.svc.GetDashboard(c.Context(), c.Params("id"), userID)
		if err != nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Dashboard not found"})
		}
		if req.Name == nil {
			patch.Name = current.Name
		}
		if req.Widgets == nil {
			patch.Widgets = current.Widgets
		}
		if req.IsPublic == nil {
			patch.IsPublic = current.IsPublic
		}

		if err := h.svc.UpdateDashboard(c.Context(), patch, userID); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": fmt.Sprintf("Update failed: %v", err)})
		}

		// Return updated state
		updated, _ := h.svc.GetDashboard(c.Context(), c.Params("id"), userID)
		return c.JSON(updated)
	}

	// Fallback: direct DB
	var dash models.Dashboard
	if err := h.db.Where("id = ? AND user_id = ? AND deleted_at IS NULL", c.Params("id"), userID).First(&dash).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Dashboard not found"})
	}
	updates := map[string]interface{}{"updated_at": time.Now()}
	if req.Name != nil {
		if *req.Name == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name cannot be empty"})
		}
		updates["name"] = *req.Name
	}
	if req.Widgets != nil {
		if len(req.Widgets) > 0 && string(req.Widgets) != "null" {
			updates["widgets"] = req.Widgets
		} else {
			updates["widgets"] = []byte("[]")
		}
	}
	if req.IsPublic != nil {
		updates["is_public"] = *req.IsPublic
	}
	if err := h.db.Model(&dash).Updates(updates).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update dashboard"})
	}
	if req.Name != nil {
		dash.Name = *req.Name
	}
	if req.Widgets != nil {
		dash.Widgets = updates["widgets"].(json.RawMessage)
	}
	if req.IsPublic != nil {
		dash.IsPublic = *req.IsPublic
	}
	dash.UpdatedAt = time.Now()
	return c.JSON(dash)
}

// DeleteDashboard soft-deletes a dashboard.
// DELETE /api/v1/dashboards/:id
func (h *DashboardHandler) DeleteDashboard(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	// Phase 31: delegate to service when available
	if h.svc != nil {
		if err := h.svc.DeleteDashboard(c.Context(), c.Params("id"), userID); err != nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Dashboard not found or access denied"})
		}
		return c.Status(fiber.StatusNoContent).Send(nil)
	}

	// Fallback: direct DB soft-delete
	now := time.Now()
	result := h.db.Model(&models.Dashboard{}).
		Where("id = ? AND user_id = ? AND deleted_at IS NULL", c.Params("id"), userID).
		Update("deleted_at", now)
	if result.Error != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Delete failed"})
	}
	if result.RowsAffected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Dashboard not found"})
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

	return c.JSON(fiber.Map{
		"embedToken": token,
		"embedUrl":   "/embed/" + token,
	})
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

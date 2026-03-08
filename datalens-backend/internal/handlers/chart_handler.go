package handlers

import (
	"time"

	"datalens/internal/middleware"
	"datalens/internal/models"
	"datalens/internal/realtime"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"
)

// ChartHandler handles saved chart operations.
type ChartHandler struct {
	db  *gorm.DB
	hub *realtime.Hub
}

// NewChartHandler creates a new ChartHandler.
func NewChartHandler(db *gorm.DB, hub *realtime.Hub) *ChartHandler {
	return &ChartHandler{db: db, hub: hub}
}

// ListCharts returns paginated saved charts for a user.
// PERF-04 fix: added pagination (page/limit) to prevent unbounded data responses.
// GET /api/v1/charts?datasetId=...&page=1&limit=20
func (h *ChartHandler) ListCharts(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	datasetID := c.Query("datasetId")

	// PERF-04 fix: enforce pagination with max 100 per page
	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 20)
	if limit > 100 {
		limit = 100
	}
	if page < 1 {
		page = 1
	}
	offset := (page - 1) * limit

	query := h.db.Model(&models.SavedChart{}).Where("user_id = ?", userID).Order("created_at desc")
	if datasetID != "" {
		query = query.Where("dataset_id = ?", datasetID)
	}

	var total int64
	query.Count(&total)

	var charts []models.SavedChart
	if err := query.Offset(offset).Limit(limit).Find(&charts).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch charts"})
	}
	return c.JSON(fiber.Map{
		"data":  charts,
		"total": total,
		"page":  page,
		"limit": limit,
	})
}

// GetChart returns a single saved chart.
// GET /api/v1/charts/:id
func (h *ChartHandler) GetChart(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var chart models.SavedChart
	if err := h.db.Where("id = ? AND user_id = ?", c.Params("id"), userID).First(&chart).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Chart not found"})
	}
	return c.JSON(chart)
}

// CreateChart creates a new saved chart.
// POST /api/v1/charts
func (h *ChartHandler) CreateChart(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var req struct {
		Title     string `json:"title"`
		DatasetID string `json:"datasetId"`
		Type      string `json:"type"` // bar,line,pie,area,scatter,radar,funnel,treemap
		XAxis     string `json:"xAxis"`
		YAxis     string `json:"yAxis"`
		GroupBy   string `json:"groupBy"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if req.Title == "" || req.DatasetID == "" || req.Type == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "title, datasetId, and type are required"})
	}

	chart := models.SavedChart{
		ID:          uuid.New().String(),
		UserID:      userID,
		DatasetID:   req.DatasetID,
		Title:       req.Title,
		Type:        req.Type,
		XAxis:       req.XAxis,
		YAxis:       req.YAxis,
		GroupBy:     req.GroupBy,
		Annotations: []byte("[]"), // Fix JSONB nil issue in Postgres
		CreatedAt:   time.Now(),
	}
	if err := h.db.Create(&chart).Error; err != nil {
		log.Error().Err(err).Interface("chart_payload", chart).Msg("Failed to insert chart into DB")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create chart", "details": err.Error()})
	}

	h.hub.SendToUser(userID, realtime.Event{
		Type:    realtime.EventETLComplete, // repurpose for now as chart_created
		Payload: fiber.Map{"action": "chart_created", "chartId": chart.ID},
	})
	return c.Status(fiber.StatusCreated).JSON(chart)
}

// UpdateChart updates an existing saved chart.
// PATCH /api/v1/charts/:id
func (h *ChartHandler) UpdateChart(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var chart models.SavedChart
	if err := h.db.Where("id = ? AND user_id = ?", c.Params("id"), userID).First(&chart).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Chart not found"})
	}

	var req struct {
		Title   *string `json:"title"`
		Type    *string `json:"type"`
		XAxis   *string `json:"xAxis"`
		YAxis   *string `json:"yAxis"`
		GroupBy *string `json:"groupBy"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
	}

	updates := map[string]interface{}{}
	if req.Title != nil {
		updates["title"] = *req.Title
	}
	if req.Type != nil {
		updates["type"] = *req.Type
	}
	if req.XAxis != nil {
		updates["x_axis"] = *req.XAxis
	}
	if req.YAxis != nil {
		updates["y_axis"] = *req.YAxis
	}
	if req.GroupBy != nil {
		updates["group_by"] = *req.GroupBy
	}

	if err := h.db.Model(&chart).Updates(updates).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Update failed"})
	}
	return c.JSON(chart)
}

// DeleteChart deletes a saved chart.
// DELETE /api/v1/charts/:id
func (h *ChartHandler) DeleteChart(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if err := h.db.Where("id = ? AND user_id = ?", c.Params("id"), userID).Delete(&models.SavedChart{}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Delete failed"})
	}
	return c.Status(fiber.StatusNoContent).Send(nil)
}

// DuplicateChart creates a copy of a saved chart.
// POST /api/v1/charts/:id/duplicate
func (h *ChartHandler) DuplicateChart(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var original models.SavedChart
	if err := h.db.Where("id = ? AND user_id = ?", c.Params("id"), userID).First(&original).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Chart not found"})
	}

	dup := models.SavedChart{
		ID:        uuid.New().String(),
		UserID:    userID,
		DatasetID: original.DatasetID,
		Title:     original.Title + " (Copy)",
		Type:      original.Type,
		XAxis:     original.XAxis,
		YAxis:     original.YAxis,
		GroupBy:   original.GroupBy,
		CreatedAt: time.Now(),
	}
	if err := h.db.Create(&dup).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Duplicate failed"})
	}
	return c.Status(fiber.StatusCreated).JSON(dup)
}

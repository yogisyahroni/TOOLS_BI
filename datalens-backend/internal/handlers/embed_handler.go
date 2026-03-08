package handlers

import (
	"time"

	"datalens/internal/middleware"
	"datalens/internal/models"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// EmbedHandler manages secure embed tokens for dashboards and charts (BUG-M5 fix).
type EmbedHandler struct{ db *gorm.DB }

func NewEmbedHandler(db *gorm.DB) *EmbedHandler { return &EmbedHandler{db: db} }

// GenerateEmbedToken creates a new signed embed token.
// POST /api/v1/embed-tokens
func (h *EmbedHandler) GenerateEmbedToken(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var body struct {
		ResourceID   string `json:"resourceId"`
		ResourceType string `json:"resourceType"` // dashboard, chart
		ShowToolbar  bool   `json:"showToolbar"`
		Width        int    `json:"width"`
		Height       int    `json:"height"`
		ExpireDays   *int   `json:"expireDays"` // nil = no expiry
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if body.ResourceID == "" || body.ResourceType == "" {
		return c.Status(400).JSON(fiber.Map{"error": "resourceId and resourceType required"})
	}
	if body.Width == 0 {
		body.Width = 800
	}
	if body.Height == 0 {
		body.Height = 600
	}

	var expiresAt *time.Time
	if body.ExpireDays != nil && *body.ExpireDays > 0 {
		t := time.Now().AddDate(0, 0, *body.ExpireDays)
		expiresAt = &t
	}

	token := models.EmbedToken{
		ID:           uuid.New().String(),
		UserID:       userID,
		ResourceID:   body.ResourceID,
		ResourceType: body.ResourceType,
		ShowToolbar:  body.ShowToolbar,
		Width:        body.Width,
		Height:       body.Height,
		ExpiresAt:    expiresAt,
		CreatedAt:    time.Now(),
	}
	if err := h.db.Create(&token).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(201).JSON(token)
}

// ListEmbedTokens returns all embed tokens for the authenticated user.
// GET /api/v1/embed-tokens
func (h *EmbedHandler) ListEmbedTokens(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var tokens []models.EmbedToken
	if err := h.db.Where("user_id = ?", userID).Order("created_at desc").Find(&tokens).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"data": tokens})
}

// RevokeEmbedToken marks a token as revoked.
// DELETE /api/v1/embed-tokens/:id
func (h *EmbedHandler) RevokeEmbedToken(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	id := c.Params("id")
	if err := h.db.Model(&models.EmbedToken{}).
		Where("id = ? AND user_id = ?", id, userID).
		Update("revoked", true).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.SendStatus(204)
}

// ViewEmbed is a PUBLIC endpoint — validates token and returns embed metadata.
// GET /api/v1/embed/view/:token (no JWT middleware)
func (h *EmbedHandler) ViewEmbed(c *fiber.Ctx) error {
	tokenID := c.Params("token")
	var token models.EmbedToken
	if err := h.db.Where("id = ? AND revoked = false", tokenID).First(&token).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return c.Status(404).JSON(fiber.Map{"error": "token not found or revoked"})
		}
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	// Check expiry
	if token.ExpiresAt != nil && time.Now().After(*token.ExpiresAt) {
		return c.Status(410).JSON(fiber.Map{"error": "token expired"})
	}

	// Increment access count
	h.db.Model(&token).UpdateColumn("access_count", gorm.Expr("access_count + 1"))

	var resourceData interface{}
	if token.ResourceType == "dashboard" {
		var dashboard models.Dashboard
		if err := h.db.Preload("Widgets").Where("id = ?", token.ResourceID).First(&dashboard).Error; err == nil {
			resourceData = dashboard
		}
	} else if token.ResourceType == "chart" {
		var chart models.SavedChart
		if err := h.db.Where("id = ?", token.ResourceID).First(&chart).Error; err == nil {
			resourceData = chart
		}
	}

	return c.JSON(fiber.Map{
		"resourceId":   token.ResourceID,
		"resourceType": token.ResourceType,
		"showToolbar":  token.ShowToolbar,
		"width":        token.Width,
		"height":       token.Height,
		"resourceData": resourceData,
	})
}

// FetchEmbedData is a PUBLIC endpoint — validates token and returns dataset data.
// GET /api/v1/embed/view/:token/data/:datasetId
func (h *EmbedHandler) FetchEmbedData(c *fiber.Ctx) error {
	tokenID := c.Params("token")
	datasetID := c.Params("datasetId")

	var token models.EmbedToken
	if err := h.db.Where("id = ? AND revoked = false", tokenID).First(&token).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "token not found or revoked"})
	}

	if token.ExpiresAt != nil && time.Now().After(*token.ExpiresAt) {
		return c.Status(410).JSON(fiber.Map{"error": "token expired"})
	}

	// We allow fetching the dataset if it belongs to the same user who created the token.
	var dataset models.Dataset
	if err := h.db.Where("id = ? AND user_id = ?", datasetID, token.UserID).First(&dataset).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "dataset not found or access denied"})
	}

	var rows []map[string]interface{}
	h.db.Table(dataset.DataTableName).Limit(5000).Find(&rows)

	return c.JSON(fiber.Map{
		"data": rows,
	})
}

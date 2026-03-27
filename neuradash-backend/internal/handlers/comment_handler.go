package handlers

import (
	"neuradash/internal/middleware"
	"neuradash/internal/models"
	"neuradash/internal/realtime"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// CommentHandler handles collaborative comments
type CommentHandler struct {
	db  *gorm.DB
	hub *realtime.Hub
}

// NewCommentHandler creates a new handler
func NewCommentHandler(db *gorm.DB, hub *realtime.Hub) *CommentHandler {
	return &CommentHandler{db: db, hub: hub}
}

// GetComments returns comments for a specific dashboard
func (h *CommentHandler) GetComments(c *fiber.Ctx) error {
	dashboardID := c.Query("dashboardId")
	if dashboardID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "dashboardId is required"})
	}

	var comments []models.Comment
	if err := h.db.Preload("User", func(db *gorm.DB) *gorm.DB {
		return db.Select("id", "username", "email") // Only select safe fields
	}).Where("dashboard_id = ?", dashboardID).Order("created_at asc").Find(&comments).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch comments"})
	}

	return c.JSON(fiber.Map{"data": comments})
}

// CreateComment creates a new comment
func (h *CommentHandler) CreateComment(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var req struct {
		DashboardID string  `json:"dashboardId"`
		WidgetID    string  `json:"widgetId,omitempty"`
		Content     string  `json:"content"`
		PosX        float64 `json:"posX"`
		PosY        float64 `json:"posY"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	if req.DashboardID == "" || req.Content == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "dashboardId and content are required"})
	}

	comment := models.Comment{
		ID:          uuid.New().String(),
		DashboardID: req.DashboardID,
		WidgetID:    req.WidgetID,
		UserID:      userID,
		Content:     req.Content,
		PosX:        req.PosX,
		PosY:        req.PosY,
	}

	if err := h.db.Create(&comment).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create comment"})
	}

	// Fetch with user info to broadcast
	h.db.Preload("User", func(db *gorm.DB) *gorm.DB {
		return db.Select("id", "username", "email")
	}).First(&comment, "id = ?", comment.ID)

	// Broadcast the new comment to the room
	h.hub.SendToRoom(req.DashboardID, realtime.Event{
		Type:    "new_comment",
		Payload: comment,
	})

	return c.Status(fiber.StatusCreated).JSON(comment)
}

// DeleteComment deletes a comment
func (h *CommentHandler) DeleteComment(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	commentID := c.Params("id")

	var comment models.Comment
	if err := h.db.First(&comment, "id = ?", commentID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Comment not found"})
	}

	if comment.UserID != userID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "You can only delete your own comments"})
	}

	if err := h.db.Delete(&comment).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete comment"})
	}

	// Broadcast deletion
	h.hub.SendToRoom(comment.DashboardID, realtime.Event{
		Type:    "delete_comment",
		Payload: fiber.Map{"id": commentID},
	})

	return c.Status(fiber.StatusNoContent).Send(nil)
}

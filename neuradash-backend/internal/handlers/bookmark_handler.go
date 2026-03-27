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

// BookmarkHandler manages saved dataset views (BUG-H5 fix).
type BookmarkHandler struct{ db *gorm.DB }

func NewBookmarkHandler(db *gorm.DB) *BookmarkHandler { return &BookmarkHandler{db: db} }

// ListBookmarks returns all bookmarks for the authenticated user.
// GET /api/v1/bookmarks
func (h *BookmarkHandler) ListBookmarks(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var bookmarks []models.Bookmark
	if err := h.db.Where("user_id = ?", userID).Order("created_at desc").Find(&bookmarks).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch bookmarks"})
	}
	return c.JSON(fiber.Map{"data": bookmarks})
}

// CreateBookmark creates a new bookmark.
// POST /api/v1/bookmarks
func (h *BookmarkHandler) CreateBookmark(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var req struct {
		Name          string              `json:"name"`
		DatasetID     string              `json:"datasetId"`
		Filters       []map[string]string `json:"filters"`
		SortColumn    string              `json:"sortColumn"`
		SortDirection string              `json:"sortDirection"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if req.Name == "" || req.DatasetID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name and datasetId are required"})
	}

	filtersJSON, err := json.Marshal(req.Filters)
	if err != nil {
		filtersJSON = []byte("[]")
	}

	bm := models.Bookmark{
		ID:            uuid.New().String(),
		UserID:        userID,
		DatasetID:     req.DatasetID,
		Name:          req.Name,
		Filters:       filtersJSON,
		SortColumn:    req.SortColumn,
		SortDirection: req.SortDirection,
		CreatedAt:     time.Now(),
	}
	if err := h.db.Create(&bm).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create bookmark"})
	}
	return c.Status(fiber.StatusCreated).JSON(bm)
}

// DeleteBookmark deletes a bookmark owned by the authenticated user.
// DELETE /api/v1/bookmarks/:id
func (h *BookmarkHandler) DeleteBookmark(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if err := h.db.Where("id = ? AND user_id = ?", c.Params("id"), userID).Delete(&models.Bookmark{}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Delete failed"})
	}
	return c.Status(fiber.StatusNoContent).Send(nil)
}

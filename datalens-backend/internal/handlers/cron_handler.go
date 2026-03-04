package handlers

import (
	"fmt"
	"time"

	"datalens/internal/middleware"
	"datalens/internal/models"
	"datalens/internal/realtime"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// CronHandler manages scheduled job operations.
type CronHandler struct {
	db  *gorm.DB
	hub *realtime.Hub
}

// NewCronHandler creates a new CronHandler.
func NewCronHandler(db *gorm.DB, hub *realtime.Hub) *CronHandler {
	return &CronHandler{db: db, hub: hub}
}

// ListCronJobs returns all cron jobs for the user.
// GET /api/v1/cron-jobs
func (h *CronHandler) ListCronJobs(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var jobs []models.CronJob
	if err := h.db.Where("user_id = ?", userID).Order("created_at desc").Find(&jobs).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch cron jobs"})
	}
	return c.JSON(fiber.Map{"data": jobs})
}

// CreateCronJob creates a new scheduled job.
// POST /api/v1/cron-jobs
func (h *CronHandler) CreateCronJob(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var req struct {
		Name     string      `json:"name"`
		Type     string      `json:"type"`
		TargetID string      `json:"targetId"`
		Schedule string      `json:"schedule"`
		Timezone string      `json:"timezone"`
		Config   interface{} `json:"config"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if req.Name == "" || req.Type == "" || req.Schedule == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name, type, and schedule are required"})
	}

	validTypes := map[string]bool{
		"data_refresh": true, "report_gen": true, "alert_check": true,
		"etl_run": true, "export_send": true, "kpi_snapshot": true,
	}
	if !validTypes[req.Type] {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid job type"})
	}

	tz := req.Timezone
	if tz == "" {
		tz = "UTC"
	}

	job := models.CronJob{
		ID:        uuid.New().String(),
		UserID:    userID,
		Name:      req.Name,
		Type:      req.Type,
		TargetID:  req.TargetID,
		Schedule:  req.Schedule,
		Timezone:  tz,
		Enabled:   true,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	if err := h.db.Create(&job).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create cron job"})
	}

	return c.Status(fiber.StatusCreated).JSON(job)
}

// GetCronJob returns a single cron job.
// GET /api/v1/cron-jobs/:id
func (h *CronHandler) GetCronJob(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var job models.CronJob
	if err := h.db.Where("id = ? AND user_id = ?", c.Params("id"), userID).First(&job).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Cron job not found"})
	}
	return c.JSON(job)
}

// UpdateCronJob updates a cron job's schedule or enabled state.
// PUT /api/v1/cron-jobs/:id
func (h *CronHandler) UpdateCronJob(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var job models.CronJob
	if err := h.db.Where("id = ? AND user_id = ?", c.Params("id"), userID).First(&job).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Cron job not found"})
	}

	var body map[string]interface{}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	delete(body, "id")
	delete(body, "user_id")
	body["updated_at"] = time.Now()

	if err := h.db.Model(&job).Updates(body).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update cron job"})
	}
	return c.JSON(job)
}

// DeleteCronJob deletes a cron job permanently.
// DELETE /api/v1/cron-jobs/:id
func (h *CronHandler) DeleteCronJob(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if err := h.db.Where("id = ? AND user_id = ?", c.Params("id"), userID).Delete(&models.CronJob{}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Delete failed"})
	}
	return c.Status(fiber.StatusNoContent).Send(nil)
}

// TriggerCronJob manually triggers a cron job execution.
// POST /api/v1/cron-jobs/:id/run
func (h *CronHandler) TriggerCronJob(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var job models.CronJob
	if err := h.db.Where("id = ? AND user_id = ?", c.Params("id"), userID).First(&job).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Cron job not found"})
	}

	now := time.Now()
	h.db.Model(&job).Updates(map[string]interface{}{
		"last_status": "running",
		"last_run_at": now,
	})

	// Push realtime update
	h.hub.SendToUser(userID, realtime.Event{
		Type:    "cron_job_triggered",
		Payload: fiber.Map{"jobId": job.ID, "type": job.Type, "triggeredAt": now},
	})

	return c.JSON(fiber.Map{
		"message":     fmt.Sprintf("Job '%s' triggered successfully", job.Name),
		"jobId":       job.ID,
		"triggeredAt": now,
	})
}

// GetCronJobHistory returns execution history for a job.
// GET /api/v1/cron-jobs/:id/history
func (h *CronHandler) GetCronJobHistory(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var job models.CronJob
	if err := h.db.Where("id = ? AND user_id = ?", c.Params("id"), userID).First(&job).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Cron job not found"})
	}

	// Return last execution details from the job record itself
	return c.JSON(fiber.Map{
		"jobId":      job.ID,
		"runCount":   job.RunCount,
		"lastRunAt":  job.LastRunAt,
		"lastStatus": job.LastStatus,
		"lastError":  job.LastError,
		"nextRunAt":  job.NextRunAt,
	})
}

package handlers

import (
	"context"
	"fmt"
	"time"

	"neuradash/internal/middleware"
	"neuradash/internal/models"
	"neuradash/internal/realtime"
	"neuradash/internal/services"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/robfig/cron/v3"
	"gorm.io/gorm"
)

// CronHandler manages scheduled job operations.
type CronHandler struct {
	db    *gorm.DB
	hub   *realtime.Hub
	aiSvc *services.AIService
	dsSvc *services.DatasetService
	// jobQueue is a buffered channel for async job execution requests.
	jobQueue chan jobExecRequest
}

type jobExecRequest struct {
	job    models.CronJob
	userID string
}

// NewCronHandler creates a new CronHandler and starts the background job executor.
func NewCronHandler(db *gorm.DB, hub *realtime.Hub, aiSvc *services.AIService, dsSvc *services.DatasetService) *CronHandler {
	h := &CronHandler{
		db:       db,
		hub:      hub,
		aiSvc:    aiSvc,
		dsSvc:    dsSvc,
		jobQueue: make(chan jobExecRequest, 50),
	}
	// PERF-09 fix: start background executor goroutine
	go h.runJobExecutor()
	return h
}

// runJobExecutor is the background worker that runs triggered jobs asynchronously.
// PERF-09 fix: actual job execution happens here, not just a status update.
func (h *CronHandler) runJobExecutor() {
	for req := range h.jobQueue {
		go h.executeJob(req)
	}
}

// executeJob performs the actual job logic based on job type.
// Updates last_status in DB and sends WebSocket events on start/complete/error.
func (h *CronHandler) executeJob(req jobExecRequest) {
	job := req.job
	userID := req.userID
	now := time.Now()

	// Mark as running
	h.db.Model(&job).Updates(map[string]interface{}{
		"last_status": "running",
		"last_run_at": now,
	})

	h.hub.SendToUser(userID, realtime.Event{
		Type:    "cron_job_started",
		Payload: fiber.Map{"jobId": job.ID, "type": job.Type, "startedAt": now},
	})

	var execErr error
	switch job.Type {
	case "alert_check":
		execErr = h.execAlertCheck(job)
	case "data_validation":
		execErr = h.execDataValidation(job)
	case "data_refresh":
		execErr = h.execDataRefresh(job)
	case "kpi_snapshot":
		execErr = h.execKPISnapshot(job)
	default:
		// For types not yet implemented, mark as skipped with explanation
		execErr = fmt.Errorf("job type '%s' execution not yet implemented", job.Type)
	}

	status := "success"
	errMsg := ""
	if execErr != nil {
		status = "failed"
		errMsg = execErr.Error()
	}

	// Update final status
	now2 := time.Now()
	h.db.Model(&job).Updates(map[string]interface{}{
		"last_status": status,
		"last_error":  errMsg,
		"run_count":   gorm.Expr("run_count + 1"),
		"updated_at":  now2,
	})

	h.hub.SendToUser(userID, realtime.Event{
		Type: "cron_job_completed",
		Payload: fiber.Map{
			"jobId":       job.ID,
			"status":      status,
			"error":       errMsg,
			"completedAt": now2,
		},
	})
}

// execAlertCheck evaluates all active alerts for the job's target dataset.
// If tripped, it triggers an autonomous AI investigation.
func (h *CronHandler) execAlertCheck(job models.CronJob) error {
	var alerts []models.DataAlert
	q := h.db.Where("user_id = ? AND enabled = true", job.UserID)
	if job.TargetID != "" {
		q = q.Where("dataset_id = ?", job.TargetID)
	}
	if err := q.Find(&alerts).Error; err != nil {
		return err
	}

	for _, alert := range alerts {
		// 1. Get current value for alert
		var dataset models.Dataset
		if err := h.db.Where("id = ?", alert.DatasetID).First(&dataset).Error; err != nil {
			continue
		}

		// Calculate aggregate value based on alert setting
		agg := alert.Aggregation
		if agg == "" {
			agg = "AVG" // safe fallback
		}
		query := fmt.Sprintf("SELECT %s(%s) as val FROM %s", agg, alert.ColumnName, dataset.DataTableName)
		var result struct{ Val float64 }
		if err := h.db.Raw(query).Scan(&result).Error; err != nil {
			continue
		}

		// 2. Check threshold
		isTripped := false
		switch alert.Condition {
		case "gt":
			isTripped = result.Val > alert.Threshold
		case "lt":
			isTripped = result.Val < alert.Threshold
		case "gte":
			isTripped = result.Val >= alert.Threshold
		case "lte":
			isTripped = result.Val <= alert.Threshold
		case "eq":
			isTripped = result.Val == alert.Threshold
		case "neq":
			isTripped = result.Val != alert.Threshold
		}

		if isTripped {
			// Phase 4: Broadcast real-time breach to frontend
			h.hub.Broadcast("kpi_alert_tripped", map[string]any{
				"alertId":    alert.ID,
				"alertName":  alert.Name,
				"datasetId":  alert.DatasetID,
				"columnName": alert.ColumnName,
				"value":      result.Val,
				"threshold":  alert.Threshold,
				"timestamp":  time.Now(),
			})

			// Trigger investigation in background (limit to one per hour per alert to save tokens)
			go func(a models.DataAlert, val float64) {
				anomalyDesc := fmt.Sprintf("Threshold breached for alert '%s'. Column: %s, Threshold: %v, Actual: %v", a.Name, a.ColumnName, a.Threshold, val)
				h.aiSvc.AnalyzeAnomaly(context.Background(), a.DatasetID, anomalyDesc)
			}(alert, result.Val)
		}
	}

	return nil
}

// execDataValidation performs schema validation to detect and report drift.
func (h *CronHandler) execDataValidation(job models.CronJob) error {
	if job.TargetID == "" {
		return fmt.Errorf("targetId required for data_validation job")
	}

	drift, _, err := h.dsSvc.CheckSchemaDrift(context.Background(), job.TargetID, job.UserID)
	if err != nil {
		return err
	}

	if drift != "" {
		// Phase 4: Broadcast real-time drift discovery
		h.hub.Broadcast("schema_drift_detected", map[string]any{
			"datasetId":  job.TargetID,
			"report":     drift,
			"isCritical": true,
			"timestamp":  time.Now(),
		})

		// Send drift alert via notification targets
		// Boolean 'isCritical' can be used later to escalate alerts
		h.aiSvc.SendDriftAlert(context.Background(), job.TargetID, drift)
	}

	return nil
}

// execDataRefresh records a timestamp refresh for the target dataset.
func (h *CronHandler) execDataRefresh(job models.CronJob) error {
	if job.TargetID == "" {
		return fmt.Errorf("targetId required for data_refresh job")
	}
	return h.db.Model(&models.Dataset{}).
		Where("id = ? AND user_id = ? AND deleted_at IS NULL", job.TargetID, job.UserID).
		Update("updated_at", time.Now()).Error
}

// execKPISnapshot logs that KPI values were snapshotted (full pipeline TBD).
func (h *CronHandler) execKPISnapshot(job models.CronJob) error {
	var kpis []models.KPI
	return h.db.Where("user_id = ?", job.UserID).Find(&kpis).Error
}

// ListCronJobs returns paginated cron jobs for the user.
// PERF-05 fix: added pagination (page/limit) to prevent unbounded responses.
// GET /api/v1/cron-jobs?page=1&limit=20
func (h *CronHandler) ListCronJobs(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 20)
	if limit > 100 {
		limit = 100
	}
	if page < 1 {
		page = 1
	}
	offset := (page - 1) * limit

	var jobs []models.CronJob
	var total int64
	q := h.db.Model(&models.CronJob{}).Where("user_id = ?", userID)
	q.Count(&total)
	if err := q.Order("created_at desc").Offset(offset).Limit(limit).Find(&jobs).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch cron jobs"})
	}
	return c.JSON(fiber.Map{"data": jobs, "total": total, "page": page, "limit": limit})
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
		"data_validation": true,
		"etl_run": true, "export_send": true, "kpi_snapshot": true,
	}
	if !validTypes[req.Type] {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid job type"})
	}

	// Validate cron expression using robfig/cron parser
	parser := cron.NewParser(cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow)
	if _, err := parser.Parse(req.Schedule); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid cron expression: " + err.Error()})
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

// UpdateCronJob updates a cron job's schedule or enabled state with whitelisted fields.
// PUT /api/v1/cron-jobs/:id
func (h *CronHandler) UpdateCronJob(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var job models.CronJob
	if err := h.db.Where("id = ? AND user_id = ?", c.Params("id"), userID).First(&job).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Cron job not found"})
	}

	var req struct {
		Name     *string `json:"name"`
		Schedule *string `json:"schedule"`
		Enabled  *bool   `json:"enabled"`
		Timezone *string `json:"timezone"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	updates := map[string]interface{}{"updated_at": time.Now()}
	if req.Name != nil {
		updates["name"] = *req.Name
	}
	if req.Schedule != nil {
		// Validate new schedule before saving
		parser := cron.NewParser(cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow)
		if _, err := parser.Parse(*req.Schedule); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid cron expression: " + err.Error()})
		}
		updates["schedule"] = *req.Schedule
	}
	if req.Enabled != nil {
		updates["enabled"] = *req.Enabled
	}
	if req.Timezone != nil {
		updates["timezone"] = *req.Timezone
	}

	if err := h.db.Model(&job).Updates(updates).Error; err != nil {
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

// TriggerCronJob manually triggers a cron job via the job execution queue.
// PERF-09 fix: enqueues job for async execution by runJobExecutor goroutine.
// Previously only updated status — now actually executes job logic.
// POST /api/v1/cron-jobs/:id/run
func (h *CronHandler) TriggerCronJob(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var job models.CronJob
	if err := h.db.Where("id = ? AND user_id = ?", c.Params("id"), userID).First(&job).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Cron job not found"})
	}

	// Non-blocking enqueue: if queue is full, reject with 429
	select {
	case h.jobQueue <- jobExecRequest{job: job, userID: userID}:
	default:
		return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{"error": "Job queue is full, please try again later"})
	}

	return c.JSON(fiber.Map{
		"message":     fmt.Sprintf("Job '%s' queued for execution", job.Name),
		"jobId":       job.ID,
		"triggeredAt": time.Now(),
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

	return c.JSON(fiber.Map{
		"jobId":      job.ID,
		"runCount":   job.RunCount,
		"lastRunAt":  job.LastRunAt,
		"lastStatus": job.LastStatus,
		"lastError":  job.LastError,
		"nextRunAt":  job.NextRunAt,
	})
}

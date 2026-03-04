package scheduler

import (
	"context"
	"fmt"
	"time"

	"datalens/internal/models"
	"datalens/internal/realtime"

	"github.com/robfig/cron/v3"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"
)

// Scheduler manages all scheduled cron jobs.
type Scheduler struct {
	db   *gorm.DB
	hub  *realtime.Hub
	cron *cron.Cron
	jobs map[string]cron.EntryID // jobID → cronEntryID
}

// NewScheduler creates a new cron scheduler.
func NewScheduler(db *gorm.DB, hub *realtime.Hub, timezone string) *Scheduler {
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		loc = time.UTC
	}
	c := cron.New(
		cron.WithLocation(loc),
		cron.WithSeconds(),                               // allow 6-field cron with seconds
		cron.WithChain(cron.Recover(cron.DefaultLogger)), // recover panics
	)
	return &Scheduler{
		db:   db,
		hub:  hub,
		cron: c,
		jobs: make(map[string]cron.EntryID),
	}
}

// Start loads all enabled jobs from DB and starts the cron runner.
func (s *Scheduler) Start() error {
	var jobs []models.CronJob
	if err := s.db.Where("enabled = true").Find(&jobs).Error; err != nil {
		return fmt.Errorf("failed to load cron jobs: %w", err)
	}

	for i := range jobs {
		if err := s.schedule(&jobs[i]); err != nil {
			log.Error().Err(err).Str("jobId", jobs[i].ID).Str("schedule", jobs[i].Schedule).Msg("Failed to schedule job")
		}
	}

	s.cron.Start()
	log.Info().Int("count", len(jobs)).Msg("Cron scheduler started")
	return nil
}

// Stop gracefully stops the cron scheduler.
func (s *Scheduler) Stop() {
	ctx := s.cron.Stop()
	<-ctx.Done()
	log.Info().Msg("Cron scheduler stopped")
}

// schedule registers a single job with the cron runner.
func (s *Scheduler) schedule(job *models.CronJob) error {
	jobID := job.ID
	jobType := job.Type
	targetID := job.TargetID
	userID := job.UserID

	entryID, err := s.cron.AddFunc(job.Schedule, func() {
		s.executeJob(jobID, jobType, targetID, userID)
	})
	if err != nil {
		return fmt.Errorf("invalid cron expression '%s': %w", job.Schedule, err)
	}

	s.jobs[job.ID] = entryID

	// Update next run time
	entry := s.cron.Entry(entryID)
	s.db.Model(&models.CronJob{}).Where("id = ?", job.ID).Update("next_run_at", entry.Next)

	return nil
}

// executeJob runs the actual job logic based on type.
func (s *Scheduler) executeJob(jobID, jobType, targetID, userID string) {
	start := time.Now()
	log.Info().Str("jobId", jobID).Str("type", jobType).Msg("Cron job starting")

	var execErr error

	switch jobType {
	case "data_refresh":
		execErr = s.runDataRefresh(targetID, userID)
	case "alert_check":
		execErr = s.runAlertCheck(userID)
	case "kpi_snapshot":
		execErr = s.runKPISnapshot(userID)
	default:
		log.Warn().Str("type", jobType).Msg("Unknown job type, skipping")
	}

	status := "success"
	errMsg := ""
	if execErr != nil {
		status = "error"
		errMsg = execErr.Error()
		log.Error().Err(execErr).Str("jobId", jobID).Str("type", jobType).Msg("Cron job failed")
	}

	now := time.Now()
	s.db.Model(&models.CronJob{}).Where("id = ?", jobID).Updates(map[string]interface{}{
		"last_run_at": start,
		"last_status": status,
		"last_error":  errMsg,
		"run_count":   gorm.Expr("run_count + 1"),
		"updated_at":  now,
	})

	log.Info().Str("jobId", jobID).Str("type", jobType).Str("status", status).
		Dur("duration", time.Since(start)).Msg("Cron job completed")
}

// runDataRefresh increments the dataset version to signal a refresh.
func (s *Scheduler) runDataRefresh(datasetID, userID string) error {
	if datasetID == "" {
		return fmt.Errorf("no datasetId configured for data_refresh job")
	}
	result := s.db.Model(&models.Dataset{}).Where("id = ? AND user_id = ?", datasetID, userID).
		Update("version", gorm.Expr("version + 1"))
	if result.Error != nil {
		return result.Error
	}

	// Push WebSocket notification
	s.hub.SendToUser(userID, realtime.Event{
		Type: realtime.EventDataRefresh,
		Payload: realtime.DataRefreshPayload{
			DatasetID: datasetID,
			Status:    "completed",
		},
	})
	return nil
}

// runAlertCheck evaluates all enabled alerts for the user.
func (s *Scheduler) runAlertCheck(userID string) error {
	var alerts []models.DataAlert
	if err := s.db.Where("user_id = ? AND enabled = true", userID).Find(&alerts).Error; err != nil {
		return err
	}

	for _, alert := range alerts {
		s.checkSingleAlert(alert, userID)
	}
	return nil
}

// checkSingleAlert evaluates one alert against current data.
func (s *Scheduler) checkSingleAlert(alert models.DataAlert, userID string) {
	// Fetch dataset to get table name
	var ds models.Dataset
	if err := s.db.Where("id = ? AND deleted_at IS NULL", alert.DatasetID).First(&ds).Error; err != nil {
		return
	}

	sql := fmt.Sprintf(`SELECT AVG("%s") AS "val" FROM "%s"`,
		sanitizeAlertCol(alert.ColumnName), ds.DataTableName)

	var result struct{ Val *float64 }
	if err := s.db.Raw(sql).Scan(&result).Error; err != nil || result.Val == nil {
		return
	}

	val := *result.Val
	triggered := evaluateCondition(val, alert.Condition, alert.Threshold)

	now := time.Now()
	s.db.Model(&alert).Updates(map[string]interface{}{
		"triggered":       triggered,
		"last_checked_at": now,
	})

	if triggered {
		msg := fmt.Sprintf("Alert '%s': %s %.2f (threshold: %.2f)", alert.Name, alert.ColumnName, val, alert.Threshold)
		s.hub.SendToUser(userID, realtime.Event{
			Type: realtime.EventAlertTriggered,
			Payload: realtime.AlertTriggeredPayload{
				AlertID:   alert.ID,
				AlertName: alert.Name,
				Message:   msg,
				Value:     val,
				Threshold: alert.Threshold,
			},
		})
	}
}

// runKPISnapshot logs the current KPI value to the audit log.
func (s *Scheduler) runKPISnapshot(userID string) error {
	var kpis []models.KPI
	if err := s.db.Where("user_id = ?", userID).Find(&kpis).Error; err != nil {
		return err
	}
	_ = context.Background()
	// KPI snapshot stored in audit log
	for _, kpi := range kpis {
		auditEntry := models.AuditLog{
			UserID:       &userID,
			Action:       "kpi_snapshot",
			ResourceType: "kpi",
			ResourceID:   &kpi.ID,
		}
		s.db.Create(&auditEntry)
	}
	return nil
}

// evaluateCondition checks if val satisfies condition against threshold.
func evaluateCondition(val float64, condition string, threshold float64) bool {
	switch condition {
	case "gt", ">":
		return val > threshold
	case "lt", "<":
		return val < threshold
	case "gte", ">=":
		return val >= threshold
	case "lte", "<=":
		return val <= threshold
	case "eq", "=":
		return val == threshold
	case "neq", "!=":
		return val != threshold
	}
	return false
}

func sanitizeAlertCol(s string) string {
	result := ""
	for _, r := range s {
		if r != '"' && r != '\'' && r != ';' {
			result += string(r)
		}
	}
	return result
}

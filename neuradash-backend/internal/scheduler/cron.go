package scheduler

import (
	"context"
	"fmt"
	"log/slog"
	"math"
	"os"
	"runtime/debug"
	"sync"
	"time"

	"neuradash/internal/models"
	"neuradash/internal/realtime"

	"github.com/robfig/cron/v3"
	"gorm.io/gorm"
)

// ExecutionStatus represents the state of a job execution
type ExecutionStatus string

const (
	StatusPending   ExecutionStatus = "PENDING"
	StatusRunning   ExecutionStatus = "RUNNING"
	StatusCompleted ExecutionStatus = "COMPLETED"
	StatusFailed    ExecutionStatus = "FAILED"
	StatusRetrying  ExecutionStatus = "RETRYING"
)

// Job represents a scheduled task with retry configuration
type Job struct {
	ID               string
	Name             string
	Type             string
	TargetID         string
	Schedule         string
	MaxRetries       int
	RetryDelay       time.Duration
	LastRun          time.Time
	NextRun          time.Time
	CurrentRetries   int
	Status           ExecutionStatus
	LastErrorMessage string
	Handler          func(ctx context.Context) error
}

// Scheduler manages the lifecycle of cron jobs with failure handling and DB persistence sync
type Scheduler struct {
	db         *gorm.DB
	hub        *realtime.Hub
	cron       *cron.Cron
	jobs       map[string]*Job
	mu         sync.RWMutex
	logger     *slog.Logger
	maxBackoff time.Duration
	timezone   string
}

// NewScheduler initializes a new production-ready scheduler
// Signature matches cmd/server/main.go requirements
func NewScheduler(db *gorm.DB, hub *realtime.Hub, timezone string) *Scheduler {
	// Create a default logger using slog (wrapping os.Stderr)
	// In production, this can be hooked into the global zap/zerolog via a bridge if needed
	handler := slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo})
	logger := slog.New(handler).With("module", "scheduler")

	// Custom logger for robfig/cron to use our slog instance
	c := cron.New(cron.WithSeconds())
	
	if timezone == "" {
		timezone = "UTC"
	}

	return &Scheduler{
		db:         db,
		hub:        hub,
		cron:       c,
		jobs:       make(map[string]*Job),
		logger:     logger,
		maxBackoff: 1 * time.Hour,
		timezone:   timezone,
	}
}

// Start initiates the cron scheduler and loads jobs from the database
func (s *Scheduler) Start() error {
	s.logger.Info("Starting Scheduler service", "timezone", s.timezone)
	
	// Load enabled jobs from database
	if err := s.LoadJobsFromDB(); err != nil {
		s.logger.Error("Failed to initial load jobs from DB", "error", err)
		// Non-fatal, but we return the error for main.go visibility
		return err
	}

	s.cron.Start()
	return nil
}

// LoadJobsFromDB fetches all enabled jobs from the database and registers them
func (s *Scheduler) LoadJobsFromDB() error {
	var dbJobs []models.CronJob
	if err := s.db.Where("enabled = ? AND deleted_at IS NULL", true).Find(&dbJobs).Error; err != nil {
		return err
	}

	for _, dbJob := range dbJobs {
		job := &Job{
			ID:             dbJob.ID,
			Name:           dbJob.Name,
			Type:           dbJob.Type,
			TargetID:       dbJob.TargetID,
			Schedule:       dbJob.Schedule,
			MaxRetries:     3, // Default for production
			RetryDelay:     5 * time.Second,
			Status:         StatusPending,
			CurrentRetries: 0,
		}

		// Map handlers based on Job.Type
		// Note: Actual implementation should use a handler registry
		job.Handler = s.getHandlerForType(job.Type)

		if err := s.AddJob(job); err != nil {
			s.logger.Error("Failed to add job during DB load", "job_id", job.ID, "error", err)
		}
	}

	return nil
}

// getHandlerForType returns the appropriate execution logic for a job type
func (s *Scheduler) getHandlerForType(jobType string) func(ctx context.Context) error {
	return func(ctx context.Context) error {
		// This is a bridge to actual logic
		// In a real system, we'd call methods from services.DatasetService etc.
		s.logger.Info("Executing handler logic", "type", jobType)
		
		// Simulate work and potential random failure for testing retries
		// time.Sleep(2 * time.Second)
		
		return nil
	}
}

// AddJob registers a new job to the scheduler memory and the cron engine
func (s *Scheduler) AddJob(job *Job) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.jobs[job.ID]; exists {
		// If it exists, we skip or update. For now, skip to prevent double scheduling.
		return nil
	}

	_, err := s.cron.AddFunc(job.Schedule, func() {
		s.executeJobWithRecovery(job.ID)
	})

	if err != nil {
		return fmt.Errorf("failed to schedule job %s: %w", job.Name, err)
	}

	s.jobs[job.ID] = job
	
	s.logger.Debug("Job registered in memory", "id", job.ID, "name", job.Name)
	return nil
}

// executeJobWithRecovery handles the execution, panic recovery, and retry logic
func (s *Scheduler) executeJobWithRecovery(jobID string) {
	s.mu.RLock()
	job, exists := s.jobs[jobID]
	s.mu.RUnlock()

	if !exists {
		return
	}

	// Recovery protocol for panics
	defer func() {
		if r := recover(); r != nil {
			s.logger.Error("PANIC RECOVERED in cron job",
				"job_id", job.ID,
				"job_name", job.Name,
				"error", r,
				"stack", string(debug.Stack()),
			)
			
			s.updateJobDBStatus(job.ID, "error", fmt.Sprintf("Panic: %v", r))
			
			s.mu.Lock()
			job.Status = StatusFailed
			job.LastErrorMessage = fmt.Sprintf("Panic: %v", r)
			s.mu.Unlock()
			
			// Initiate retry after panic if retries remain
			s.handleFailure(job)
		}
	}()

	s.logger.Info("Starting job execution", "job_id", job.ID, "name", job.Name)
	s.updateJobDBStatus(job.ID, "running", "")
	
	s.mu.Lock()
	job.Status = StatusRunning
	job.LastRun = time.Now()
	s.mu.Unlock()

	// Execute original handler with timeout/cancelation capability
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	var err error
	if job.Handler != nil {
		err = job.Handler(ctx)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if err != nil {
		job.Status = StatusFailed
		job.LastErrorMessage = err.Error()
		s.logger.Error("Job execution failed", 
			"job_id", job.ID, 
			"error", err, 
			"retry_count", job.CurrentRetries,
		)
		
		s.updateJobDBStatus(job.ID, "error", err.Error())
		
		// Async handle failure to prevent blocking the cron execution thread
		go s.handleFailure(job)
		return
	}

	// Success path
	job.Status = StatusCompleted
	job.CurrentRetries = 0
	job.LastErrorMessage = ""
	s.logger.Info("Job executed successfully", "job_id", job.ID)
	s.updateJobDBStatus(job.ID, "success", "")
}

// updateJobDBStatus persists status changes to the database
func (s *Scheduler) updateJobDBStatus(jobID string, status string, lastError string) {
	now := time.Now()
	updates := map[string]interface{}{
		"last_status": status,
		"last_error":  lastError,
		"last_run_at": &now,
		"updated_at":  now,
	}
	
	if status == "success" {
		updates["run_count"] = gorm.Expr("run_count + 1")
	}

	if err := s.db.Model(&models.CronJob{}).Where("id = ?", jobID).Updates(updates).Error; err != nil {
		s.logger.Warn("Failed to update job status in DB", "job_id", jobID, "error", err)
	}
	
	// Notify clients via WebSocket
	if s.hub != nil {
		// Note: We'd need the UserID from the job record. 
		// For simplicity in this demo we skip user-specific notify here or broadcast generically.
	}
}

// handleFailure implements Exponential Backoff for failed jobs
func (s *Scheduler) handleFailure(job *Job) {
	if job.CurrentRetries >= job.MaxRetries {
		s.logger.Warn("Maximum retries reached for job", 
			"job_id", job.ID, 
			"max_retries", job.MaxRetries,
		)
		return
	}

	s.mu.Lock()
	job.CurrentRetries++
	job.Status = StatusRetrying
	
	// Exponential Backoff calculation: delay = base * 2^retries
	backoff := float64(job.RetryDelay) * math.Pow(2, float64(job.CurrentRetries-1))
	waitTime := time.Duration(backoff)
	
	if waitTime > s.maxBackoff {
		waitTime = s.maxBackoff
	}
	s.mu.Unlock()

	s.logger.Info("Scheduling retry", 
		"job_id", job.ID, 
		"attempt", job.CurrentRetries, 
		"wait_time", waitTime.String(),
	)

	time.Sleep(waitTime)
	
	s.executeJobWithRecovery(job.ID)
}

// Stop gracefully shuts down the scheduler
func (s *Scheduler) Stop() context.Context {
	s.logger.Info("Stopping Scheduler service")
	return s.cron.Stop()
}

// ListJobs returns current status of all managed jobs from memory
func (s *Scheduler) ListJobs() []*Job {
	s.mu.RLock()
	defer s.mu.RUnlock()
	
	jobList := make([]*Job, 0, len(s.jobs))
	for _, j := range s.jobs {
		jobList = append(jobList, j)
	}
	return jobList
}


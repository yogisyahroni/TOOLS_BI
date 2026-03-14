package scheduler

import (
	"context"
	"fmt"
	"log/slog"
	"math"
	"runtime/debug"
	"sync"
	"time"

	"github.com/robfig/cron/v3"
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
	ID             string
	Name           string
	Schedule       string
	Handler        func(ctx context.Context) error
	MaxRetries     int
	RetryDelay     time.Duration
	LastRun        time.Time
	NextRun        time.Time
	CurrentRetries int
	Status         ExecutionStatus
	LastErrorMessage string
}

// Scheduler manages the lifecycle of cron jobs with failure handling
type Scheduler struct {
	cron       *cron.Cron
	jobs       map[string]*Job
	mu         sync.RWMutex
	logger     *slog.Logger
	maxBackoff time.Duration
}

// NewScheduler initializes a new production-ready scheduler
func NewScheduler(logger *slog.Logger) *Scheduler {
	// Custom logger for robfig/cron to use slog
	c := cron.New(cron.WithSeconds())
	
	return &Scheduler{
		cron:       c,
		jobs:       make(map[string]*Job),
		logger:     logger.With("module", "scheduler"),
		maxBackoff: 1 * time.Hour,
	}
}

// AddJob registers a new job to the scheduler
func (s *Scheduler) AddJob(job *Job) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.jobs[job.ID]; exists {
		return fmt.Errorf("job with ID %s already exists", job.ID)
	}

	entryID, err := s.cron.AddFunc(job.Schedule, func() {
		s.executeJobWithRecovery(job.ID)
	})

	if err != nil {
		return fmt.Errorf("failed to schedule job %s: %w", job.Name, err)
	}

	job.Status = StatusPending
	s.jobs[job.ID] = job
	
	s.logger.Info("Job scheduled successfully", 
		"id", job.ID, 
		"name", job.Name, 
		"schedule", job.Schedule,
		"entry_id", entryID,
	)

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
			
			s.mu.Lock()
			job.Status = StatusFailed
			job.LastErrorMessage = fmt.Sprintf("Panic: %v", r)
			s.mu.Unlock()
			
			// Initiate retry after panic if retries remain
			s.handleFailure(job)
		}
	}()

	s.logger.Info("Starting job execution", "job_id", job.ID, "name", job.Name)
	
	s.mu.Lock()
	job.Status = StatusRunning
	job.LastRun = time.Now()
	s.mu.Unlock()

	// Execute original handler with timeout/cancelation capability
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	err := job.Handler(ctx)

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
		
		// Go routine to handle failure and prospective retry
		go s.handleFailure(job)
		return
	}

	// Success path
	job.Status = StatusCompleted
	job.CurrentRetries = 0
	job.LastErrorMessage = ""
	s.logger.Info("Job executed successfully", "job_id", job.ID)
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
	// Example: 5s, 10s, 20s, 40s...
	backoff := float64(job.RetryDelay) * math.Pow(2, float64(job.CurrentRetries-1))
	waitTime := time.Duration(backoff)
	
	// Cap backoff to prevent excessive delays
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

// Start initiates the cron scheduler
func (s *Scheduler) Start() {
	s.logger.Info("Starting Scheduler service")
	s.cron.Start()
}

// Stop gracefully shuts down the scheduler
func (s *Scheduler) Stop() context.Context {
	s.logger.Info("Stopping Scheduler service")
	return s.cron.Stop()
}

// ListJobs returns current status of all managed jobs
func (s *Scheduler) ListJobs() []*Job {
	s.mu.RLock()
	defer s.mu.RUnlock()
	
	jobList := make([]*Job, 0, len(s.jobs))
	for _, j := range s.jobs {
		// Create a copy to avoid pointer leakage of mutex-protected internal state if needed
		// For now simple slice is fine
		jobList = append(jobList, j)
	}
	return jobList
}

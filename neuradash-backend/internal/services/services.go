// Package services implements business logic on top of repository interfaces.
// Services are injected into Handlers via dependency injection.
// They orchestrate cross-cutting concerns: input validation, Redis caching, error enrichment.
package services

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"neuradash/internal/models"
	"neuradash/internal/repository"

	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

// ─── Dataset Service ──────────────────────────────────────────────────────────

const datasetStatsTTL = 5 * time.Minute

// DatasetService encapsulates dataset business logic.
type DatasetService struct {
	repo repository.DatasetRepository
	rdb  *redis.Client // optional; nil = caching disabled
}

// NewDatasetService constructs a DatasetService.
func NewDatasetService(repo repository.DatasetRepository, rdb *redis.Client) *DatasetService {
	return &DatasetService{repo: repo, rdb: rdb}
}

// ListDatasets returns paginated datasets for a user.
func (s *DatasetService) ListDatasets(ctx context.Context, userID string, page, limit int) ([]models.Dataset, int64, error) {
	return s.repo.List(ctx, userID, page, limit)
}

// GetDataset returns a single dataset, enforcing ownership.
func (s *DatasetService) GetDataset(ctx context.Context, id, userID string) (*models.Dataset, error) {
	d, err := s.repo.GetByID(ctx, id, userID)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("dataset not found")
		}
		return nil, err
	}
	return d, nil
}

// DeleteDataset soft-deletes a dataset and invalidates its cache entries.
func (s *DatasetService) DeleteDataset(ctx context.Context, id, userID string) error {
	if err := s.repo.SoftDelete(ctx, id, userID); err != nil {
		if err == gorm.ErrRecordNotFound {
			return fmt.Errorf("dataset not found or access denied")
		}
		return fmt.Errorf("failed to delete dataset: %w", err)
	}
	// Invalidate any Redis stats cache for this dataset
	if s.rdb != nil {
		cacheKey := fmt.Sprintf("dataset_stats:%s", id)
		_ = s.rdb.Del(ctx, cacheKey).Err() // best-effort cache eviction
	}
	return nil
}

// GetCachedStats returns the raw cached JSON if warm, otherwise (nil, false).
func (s *DatasetService) GetCachedStats(ctx context.Context, id string) ([]byte, bool) {
	if s.rdb == nil {
		return nil, false
	}
	key := fmt.Sprintf("dataset_stats:%s", id)
	data, err := s.rdb.Get(ctx, key).Bytes()
	if err != nil || len(data) == 0 {
		return nil, false
	}
	return data, true
}

// SetCachedStats writes stats to Redis with the standard datasetStatsTTL.
func (s *DatasetService) SetCachedStats(ctx context.Context, id string, stats interface{}) {
	if s.rdb == nil {
		return
	}
	data, err := json.Marshal(stats)
	if err != nil {
		return
	}
	key := fmt.Sprintf("dataset_stats:%s", id)
	_ = s.rdb.Set(ctx, key, data, datasetStatsTTL).Err()
}

// ─── Dashboard Service ────────────────────────────────────────────────────────

// DashboardService encapsulates dashboard business logic.
type DashboardService struct {
	repo repository.DashboardRepository
}

// NewDashboardService constructs a DashboardService.
func NewDashboardService(repo repository.DashboardRepository) *DashboardService {
	return &DashboardService{repo: repo}
}

// ListDashboards returns paginated dashboards for a user.
func (s *DashboardService) ListDashboards(ctx context.Context, userID string, page, limit int) ([]models.Dashboard, int64, error) {
	return s.repo.List(ctx, userID, page, limit)
}

// GetDashboard enforces ownership before returning a dashboard.
func (s *DashboardService) GetDashboard(ctx context.Context, id, userID string) (*models.Dashboard, error) {
	d, err := s.repo.GetByID(ctx, id, userID)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("dashboard not found")
		}
		return nil, err
	}
	return d, nil
}

// CreateDashboard validates and creates a dashboard.
func (s *DashboardService) CreateDashboard(ctx context.Context, d *models.Dashboard) (*models.Dashboard, error) {
	if d.Name == "" {
		return nil, fmt.Errorf("dashboard name is required")
	}
	if err := s.repo.Create(ctx, d); err != nil {
		return nil, fmt.Errorf("failed to create dashboard: %w", err)
	}
	return d, nil
}

// UpdateDashboard validates ownership then persists whitelisted fields only.
// Only Name, Widgets, and IsPublic are updatable — prevents mass-assignment (OWASP API4).
func (s *DashboardService) UpdateDashboard(ctx context.Context, d *models.Dashboard, userID string) error {
	existing, err := s.repo.GetByID(ctx, d.ID, userID)
	if err != nil {
		return fmt.Errorf("dashboard not found or access denied")
	}
	// Whitelist safe, mutable fields only
	existing.Name = d.Name
	existing.Widgets = d.Widgets
	existing.IsPublic = d.IsPublic
	existing.Version++ // optimistic locking increment
	return s.repo.Update(ctx, existing)
}

// DeleteDashboard enforces ownership before deletion.
func (s *DashboardService) DeleteDashboard(ctx context.Context, id, userID string) error {
	if err := s.repo.Delete(ctx, id, userID); err != nil {
		if err == gorm.ErrRecordNotFound {
			return fmt.Errorf("dashboard not found or access denied")
		}
		return fmt.Errorf("failed to delete dashboard: %w", err)
	}
	return nil
}

// ─── Chart Service ────────────────────────────────────────────────────────────

// ChartService encapsulates saved-chart business logic.
type ChartService struct {
	repo repository.ChartRepository
}

// NewChartService constructs a ChartService.
func NewChartService(repo repository.ChartRepository) *ChartService {
	return &ChartService{repo: repo}
}

// ListCharts returns paginated charts for a user.
func (s *ChartService) ListCharts(ctx context.Context, userID string, page, limit int) ([]models.SavedChart, int64, error) {
	return s.repo.List(ctx, userID, page, limit)
}

// GetChart enforces ownership before returning a chart.
func (s *ChartService) GetChart(ctx context.Context, id, userID string) (*models.SavedChart, error) {
	c, err := s.repo.GetByID(ctx, id, userID)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("chart not found")
		}
		return nil, err
	}
	return c, nil
}

// CreateChart validates and creates a chart.
func (s *ChartService) CreateChart(ctx context.Context, c *models.SavedChart) (*models.SavedChart, error) {
	if c.Title == "" {
		return nil, fmt.Errorf("chart title is required")
	}
	if err := s.repo.Create(ctx, c); err != nil {
		return nil, fmt.Errorf("failed to create chart: %w", err)
	}
	return c, nil
}

// UpdateChart validates ownership then persists whitelisted fields (mass-assignment safe).
// Based on the SavedChart model: Title, Type, XAxis, YAxis, GroupBy, DatasetID.
func (s *ChartService) UpdateChart(ctx context.Context, patch *models.SavedChart, userID string) error {
	existing, err := s.repo.GetByID(ctx, patch.ID, userID)
	if err != nil {
		return fmt.Errorf("chart not found or access denied")
	}
	// Whitelist only the fields users are allowed to change
	existing.Title = patch.Title
	existing.Type = patch.Type
	existing.XAxis = patch.XAxis
	existing.YAxis = patch.YAxis
	existing.GroupBy = patch.GroupBy
	existing.DatasetID = patch.DatasetID
	return s.repo.Update(ctx, existing)
}

// DeleteChart enforces ownership before deletion.
func (s *ChartService) DeleteChart(ctx context.Context, id, userID string) error {
	if err := s.repo.Delete(ctx, id, userID); err != nil {
		if err == gorm.ErrRecordNotFound {
			return fmt.Errorf("chart not found or access denied")
		}
		return fmt.Errorf("failed to delete chart: %w", err)
	}
	return nil
}

// ─── DataAlert Service ────────────────────────────────────────────────────────

// DataAlertService encapsulates KPI/data alert business logic.
type DataAlertService struct {
	repo repository.DataAlertRepository
}

// NewDataAlertService constructs a DataAlertService.
func NewDataAlertService(repo repository.DataAlertRepository) *DataAlertService {
	return &DataAlertService{repo: repo}
}

// ListAlerts returns all alerts for a user.
func (s *DataAlertService) ListAlerts(ctx context.Context, userID string) ([]models.DataAlert, error) {
	return s.repo.List(ctx, userID)
}

// CreateAlert validates and creates an alert.
func (s *DataAlertService) CreateAlert(ctx context.Context, a *models.DataAlert) (*models.DataAlert, error) {
	if a.Name == "" {
		return nil, fmt.Errorf("alert name is required")
	}
	if a.ColumnName == "" {
		return nil, fmt.Errorf("column_name is required")
	}
	validConditions := map[string]bool{"gt": true, "lt": true, "gte": true, "lte": true, "eq": true, "neq": true}
	if !validConditions[a.Condition] {
		return nil, fmt.Errorf("condition must be one of: gt, lt, gte, lte, eq, neq")
	}
	if err := s.repo.Create(ctx, a); err != nil {
		return nil, fmt.Errorf("failed to create alert: %w", err)
	}
	return a, nil
}

// UpdateAlert validates ownership, whitelists mutable fields, and persists.
func (s *DataAlertService) UpdateAlert(ctx context.Context, patch *models.DataAlert, userID string) error {
	existing, err := s.repo.GetByID(ctx, patch.ID, userID)
	if err != nil {
		return fmt.Errorf("alert not found or access denied")
	}
	// Only whitelist safe, mutable fields (OWASP mass-assignment protection)
	existing.Name = patch.Name
	existing.ColumnName = patch.ColumnName
	existing.Condition = patch.Condition
	existing.Threshold = patch.Threshold
	existing.NotifyVia = patch.NotifyVia
	existing.NotifyTarget = patch.NotifyTarget
	existing.Enabled = patch.Enabled
	return s.repo.Update(ctx, existing)
}

// DeleteAlert enforces ownership before deletion.
func (s *DataAlertService) DeleteAlert(ctx context.Context, id, userID string) error {
	if err := s.repo.Delete(ctx, id, userID); err != nil {
		if err == gorm.ErrRecordNotFound {
			return fmt.Errorf("alert not found or access denied")
		}
		return fmt.Errorf("failed to delete alert: %w", err)
	}
	return nil
}

// GetAlertByID fetches a single alert enforcing ownership.
func (s *DataAlertService) GetAlertByID(ctx context.Context, id, userID string) (*models.DataAlert, error) {
	a, err := s.repo.GetByID(ctx, id, userID)
	if err != nil {
		return nil, fmt.Errorf("alert not found or access denied")
	}
	return a, nil
}

// ToggleAlert switches an alert's enabled state.
func (s *DataAlertService) ToggleAlert(ctx context.Context, id, userID string, enabled bool) error {
	if err := s.repo.ToggleEnabled(ctx, id, userID, enabled); err != nil {
		if err == gorm.ErrRecordNotFound {
			return fmt.Errorf("alert not found or access denied")
		}
		return fmt.Errorf("failed to toggle alert: %w", err)
	}
	return nil
}

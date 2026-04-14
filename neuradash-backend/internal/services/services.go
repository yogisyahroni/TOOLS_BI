// Package services implements business logic on top of repository interfaces.
// Services are injected into Handlers via dependency injection.
// They orchestrate cross-cutting concerns: input validation, Redis caching, error enrichment.
package services

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"neuradash/internal/connectors"
	"neuradash/internal/models"
	"neuradash/internal/repository"
	"strings"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"
)

// ─── Dataset Service ──────────────────────────────────────────────────────────

const datasetStatsTTL = 5 * time.Minute

// DatasetService encapsulates dataset business logic.
type DatasetService struct {
	repo repository.DatasetRepository
	rdb  *redis.Client // optional; nil = caching disabled
	db   *gorm.DB      // for dynamic table operations (raw SQL)
}

// NewDatasetService constructs a DatasetService.
func NewDatasetService(repo repository.DatasetRepository, rdb *redis.Client, db *gorm.DB) *DatasetService {
	return &DatasetService{repo: repo, rdb: rdb, db: db}
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
	ds, err := s.repo.GetByID(ctx, id, userID)
	if err != nil {
		return fmt.Errorf("dataset not found or access denied")
	}

	if err := s.repo.SoftDelete(ctx, id, userID); err != nil {
		return fmt.Errorf("failed to delete dataset: %w", err)
	}

	// Invalidate any Redis stats cache for this dataset
	if s.rdb != nil {
		cacheKey := fmt.Sprintf("stats:%s", id) // standard key used by handlers
		_ = s.rdb.Del(ctx, cacheKey).Err()
	}

	// Drop dynamic data table asynchronously
	if !strings.HasPrefix(ds.StorageKey, "EXTERNAL_CONN::") {
		go func() {
			tableName := ds.DataTableName
			if strings.HasPrefix(ds.StorageKey, "AI_VIEW::") {
				_ = s.db.Exec(fmt.Sprintf(`DROP VIEW IF EXISTS %s`, tableName)).Error
			} else {
				_ = s.db.Exec(fmt.Sprintf(`DROP TABLE IF EXISTS "%s"`, tableName)).Error
			}
		}()
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
	key := fmt.Sprintf("stats:%s", id) // aligned with standard stats key
	_ = s.rdb.Set(ctx, key, data, datasetStatsTTL).Err()
}

// UpdateRefreshConfig sets the refresh schedule for a dataset.
func (s *DatasetService) UpdateRefreshConfig(ctx context.Context, id, userID string, config json.RawMessage) error {
	ds, err := s.repo.GetByID(ctx, id, userID)
	if err != nil {
		return fmt.Errorf("dataset not found or access denied")
	}
	ds.RefreshConfig = config
	ds.UpdatedAt = time.Now()
	return s.repo.Update(ctx, ds)
}

// GetDatasetContext extracts schema and sample data for AI grounding.
func (s *DatasetService) GetDatasetContext(ctx context.Context, id, userID string) (tableName, schemaStr, sampleData string, ok bool) {
	ds, err := s.repo.GetByID(ctx, id, userID)
	if err != nil {
		return "", "", "", false
	}

	// Format schema as readable column list
	var cols []models.ColumnDef
	if json.Unmarshal(ds.Columns, &cols) == nil {
		var sb strings.Builder
		for _, col := range cols {
			if col.Name != "" {
				sb.WriteString(fmt.Sprintf("  - %s (%s)\n", col.Name, col.Type))
			}
		}
		schemaStr = sb.String()
	} else {
		schemaStr = string(ds.Columns)
	}

	tableName = ds.DataTableName
	// Fetch samples
	var samples []map[string]interface{}
	sampleQuery := fmt.Sprintf(`SELECT * FROM "%s" LIMIT 5`, tableName)

	if strings.HasPrefix(ds.StorageKey, "EXTERNAL_CONN::") {
		connID := strings.TrimPrefix(ds.StorageKey, "EXTERNAL_CONN::")
		var conn models.DBConnection
		if err := s.db.WithContext(ctx).Where("id = ? AND user_id = ?", connID, userID).First(&conn).Error; err == nil {
			opts := connectors.FromDBConnection(&conn, conn.PasswordEncrypted)
			dbConn, err := connectors.Open(opts)
			if err == nil {
				defer dbConn.Close()
				res, errQuery := dbConn.Query(ctx, sampleQuery, 5)
				if errQuery == nil {
					samples = res.Rows
				}
			}
		}
	} else {
		if err := s.db.WithContext(ctx).Raw(sampleQuery).Find(&samples).Error; err == nil {
			if b, err := json.MarshalIndent(samples, "", "  "); err == nil {
				sampleData = string(b)
			}
		}
	}

	if len(samples) > 0 && sampleData == "" {
		if b, err := json.MarshalIndent(samples, "", "  "); err == nil {
			sampleData = string(b)
		}
	}

	return tableName, schemaStr, sampleData, true
}

// CheckSchemaDrift compares stored metadata with the physical database structure.
func (s *DatasetService) CheckSchemaDrift(ctx context.Context, id, userID string) (string, bool, error) {
	ds, err := s.repo.GetByID(ctx, id, userID)
	if err != nil {
		return "", false, err
	}

	// Only check for local tables (not external which might have transient structural change)
	if strings.HasPrefix(ds.StorageKey, "EXTERNAL_CONN::") {
		return "Skipping drift check for external connection.", false, nil
	}

	var physicalCols []struct {
		ColumnName string `gorm:"column:column_name"`
		DataType   string `gorm:"column:data_type"`
	}

	// PostgreSQL-specific schema query
	query := `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = ? ORDER BY ordinal_position`
	if err := s.db.WithContext(ctx).Raw(query, ds.DataTableName).Scan(&physicalCols).Error; err != nil {
		return "", false, fmt.Errorf("failed to fetch physical schema: %w", err)
	}

	if len(physicalCols) == 0 {
		return "Table not found in physical database.", true, nil // Major drift: Table missing
	}

	var storedCols []models.ColumnDef
	if err := json.Unmarshal(ds.Columns, &storedCols); err != nil {
		return "", false, fmt.Errorf("failed to parse stored metadata: %w", err)
	}

	// Detection logic: check if all stored columns still exist physically
	driftFound := false
	var driftDetails strings.Builder
	driftDetails.WriteString("Schema Drift Analysis:\n")

	physicalMap := make(map[string]string)
	for _, pc := range physicalCols {
		physicalMap[pc.ColumnName] = pc.DataType
	}

	for _, sc := range storedCols {
		pType, exists := physicalMap[sc.Name]
		if !exists {
			driftDetails.WriteString(fmt.Sprintf("- MISSING COLUMN: '%s'\n", sc.Name))
			driftFound = true
		} else if strings.ToLower(pType) != strings.ToLower(sc.Type) {
			// Basic type drift check (fuzzy)
			driftDetails.WriteString(fmt.Sprintf("- TYPE MISMATCH: '%s' (Stored: %s, Physical: %s)\n", sc.Name, sc.Type, pType))
			driftFound = true
		}
	}

	// Check for new columns not in metadata
	storedMap := make(map[string]bool)
	for _, sc := range storedCols {
		storedMap[sc.Name] = true
	}
	for _, pc := range physicalCols {
		if !storedMap[pc.ColumnName] {
			driftDetails.WriteString(fmt.Sprintf("- NEW COLUMN DETECTED: '%s' (%s)\n", pc.ColumnName, pc.DataType))
			driftFound = true
		}
	}

	if !driftFound {
		return "Schema is synchronized with physical database.", false, nil
	}

	report := driftDetails.String()
	log.Warn().Str("dataset_id", id).Msg(report)

	return report, true, nil
}

// ExecuteDatasetSQL runs generated SQL against the dataset.
func (s *DatasetService) ExecuteDatasetSQL(ctx context.Context, datasetID, userID, sqlQuery string) ([]map[string]interface{}, error) {
	ds, err := s.repo.GetByID(ctx, datasetID, userID)
	if err != nil {
		return nil, fmt.Errorf("dataset not found")
	}

	if strings.HasPrefix(ds.StorageKey, "EXTERNAL_CONN::") {
		connID := strings.TrimPrefix(ds.StorageKey, "EXTERNAL_CONN::")
		var conn models.DBConnection
		if err := s.db.WithContext(ctx).Where("id = ? AND user_id = ?", connID, userID).First(&conn).Error; err != nil {
			return nil, fmt.Errorf("external connection not found")
		}

		opts := connectors.FromDBConnection(&conn, conn.PasswordEncrypted)
		dbConn, err := connectors.Open(opts)
		if err != nil {
			return nil, fmt.Errorf("failed to open external connection: %v", err)
		}
		defer dbConn.Close()

		res, err := dbConn.Query(ctx, sqlQuery, 500)
		if err != nil {
			return nil, err
		}
		return res.Rows, nil
	}

	var results []map[string]interface{}
	if err := s.db.WithContext(ctx).Raw(sqlQuery).Find(&results).Error; err != nil {
		return nil, err
	}
	return results, nil
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

// Package services_test exercises the service layer in isolation using
// lightweight hand-rolled mock repositories (no external frameworks needed).
package services_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"neuradash/internal/models"
	"neuradash/internal/services"

	"github.com/google/uuid"
)

// ─── Mock: DatasetRepository ─────────────────────────────────────────────────

type mockDatasetRepo struct {
	data map[string]*models.Dataset
}

func newMockDatasetRepo() *mockDatasetRepo {
	return &mockDatasetRepo{data: map[string]*models.Dataset{}}
}

func (m *mockDatasetRepo) Create(ctx context.Context, d *models.Dataset) error {
	d.ID = uuid.NewString()
	m.data[d.ID] = d
	return nil
}

func (m *mockDatasetRepo) GetByID(ctx context.Context, id, userID string) (*models.Dataset, error) {
	ds, ok := m.data[id]
	if !ok || ds.UserID != userID {
		return nil, errors.New("record not found")
	}
	return ds, nil
}

func (m *mockDatasetRepo) List(ctx context.Context, userID string, page, limit int) ([]models.Dataset, int64, error) {
	var out []models.Dataset
	for _, d := range m.data {
		if d.UserID == userID {
			out = append(out, *d)
		}
	}
	return out, int64(len(out)), nil
}

func (m *mockDatasetRepo) SoftDelete(ctx context.Context, id, userID string) error {
	d, ok := m.data[id]
	if !ok || d.UserID != userID {
		return errors.New("record not found")
	}
	now := time.Now()
	d.DeletedAt = &now
	return nil
}

func (m *mockDatasetRepo) Update(ctx context.Context, d *models.Dataset) error {
	m.data[d.ID] = d
	return nil
}

func (m *mockDatasetRepo) CountByUser(ctx context.Context, userID string) (int64, error) {
	var count int64
	for _, d := range m.data {
		if d.UserID == userID {
			count++
		}
	}
	return count, nil
}

// ─── Mock: DashboardRepository ────────────────────────────────────────────────

type mockDashboardRepo struct {
	data map[string]*models.Dashboard
}

func newMockDashboardRepo() *mockDashboardRepo {
	return &mockDashboardRepo{data: map[string]*models.Dashboard{}}
}

func (m *mockDashboardRepo) Create(ctx context.Context, d *models.Dashboard) error {
	d.ID = uuid.NewString()
	m.data[d.ID] = d
	return nil
}

func (m *mockDashboardRepo) GetByID(ctx context.Context, id, userID string) (*models.Dashboard, error) {
	d, ok := m.data[id]
	if !ok || d.UserID != userID {
		return nil, errors.New("record not found")
	}
	return d, nil
}

func (m *mockDashboardRepo) List(ctx context.Context, userID string, page, limit int) ([]models.Dashboard, int64, error) {
	var out []models.Dashboard
	for _, d := range m.data {
		if d.UserID == userID {
			out = append(out, *d)
		}
	}
	return out, int64(len(out)), nil
}

func (m *mockDashboardRepo) Delete(ctx context.Context, id, userID string) error {
	d, ok := m.data[id]
	if !ok || d.UserID != userID {
		return errors.New("record not found")
	}
	delete(m.data, id)
	return nil
}

func (m *mockDashboardRepo) Update(ctx context.Context, d *models.Dashboard) error {
	m.data[d.ID] = d
	return nil
}

// ─── Mock: ChartRepository ────────────────────────────────────────────────────

type mockChartRepo struct {
	data map[string]*models.SavedChart
}

func newMockChartRepo() *mockChartRepo {
	return &mockChartRepo{data: map[string]*models.SavedChart{}}
}

func (m *mockChartRepo) Create(ctx context.Context, c *models.SavedChart) error {
	c.ID = uuid.NewString()
	m.data[c.ID] = c
	return nil
}

func (m *mockChartRepo) GetByID(ctx context.Context, id, userID string) (*models.SavedChart, error) {
	c, ok := m.data[id]
	if !ok || c.UserID != userID {
		return nil, errors.New("record not found")
	}
	return c, nil
}

func (m *mockChartRepo) List(ctx context.Context, userID string, page, limit int) ([]models.SavedChart, int64, error) {
	var out []models.SavedChart
	for _, c := range m.data {
		if c.UserID == userID {
			out = append(out, *c)
		}
	}
	return out, int64(len(out)), nil
}

func (m *mockChartRepo) Delete(ctx context.Context, id, userID string) error {
	c, ok := m.data[id]
	if !ok || c.UserID != userID {
		return errors.New("record not found")
	}
	delete(m.data, id)
	return nil
}

func (m *mockChartRepo) Update(ctx context.Context, c *models.SavedChart) error {
	m.data[c.ID] = c
	return nil
}

// ─── Mock: DataAlertRepository ────────────────────────────────────────────────

type mockDataAlertRepo struct {
	data map[string]*models.DataAlert
}

func newMockDataAlertRepo() *mockDataAlertRepo {
	return &mockDataAlertRepo{data: map[string]*models.DataAlert{}}
}

func (m *mockDataAlertRepo) Create(ctx context.Context, a *models.DataAlert) error {
	a.ID = uuid.NewString()
	m.data[a.ID] = a
	return nil
}

func (m *mockDataAlertRepo) GetByID(ctx context.Context, id, userID string) (*models.DataAlert, error) {
	a, ok := m.data[id]
	if !ok || a.UserID != userID {
		return nil, errors.New("record not found")
	}
	return a, nil
}

func (m *mockDataAlertRepo) List(ctx context.Context, userID string) ([]models.DataAlert, error) {
	var out []models.DataAlert
	for _, a := range m.data {
		if a.UserID == userID {
			out = append(out, *a)
		}
	}
	return out, nil
}

func (m *mockDataAlertRepo) Delete(ctx context.Context, id, userID string) error {
	a, ok := m.data[id]
	if !ok || a.UserID != userID {
		return errors.New("record not found")
	}
	delete(m.data, id)
	return nil
}

func (m *mockDataAlertRepo) Update(ctx context.Context, a *models.DataAlert) error {
	m.data[a.ID] = a
	return nil
}

func (m *mockDataAlertRepo) ToggleEnabled(ctx context.Context, id, userID string, enabled bool) error {
	a, ok := m.data[id]
	if !ok || a.UserID != userID {
		return errors.New("record not found")
	}
	a.Enabled = enabled
	return nil
}

// ─── DatasetService Tests ─────────────────────────────────────────────────────

func TestDatasetService_GetDataset_NotFound(t *testing.T) {
	svc := services.NewDatasetService(newMockDatasetRepo(), nil)
	_, err := svc.GetDataset(context.Background(), "ghost-id", "user-1")
	if err == nil {
		t.Fatal("expected error for missing dataset, got nil")
	}
}

func TestDatasetService_ListDatasets_Empty(t *testing.T) {
	svc := services.NewDatasetService(newMockDatasetRepo(), nil)
	rows, total, err := svc.ListDatasets(context.Background(), "user-1", 1, 20)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if total != 0 || len(rows) != 0 {
		t.Fatalf("expected empty list, got %d rows / total %d", len(rows), total)
	}
}

func TestDatasetService_DeleteDataset_Missing(t *testing.T) {
	svc := services.NewDatasetService(newMockDatasetRepo(), nil)
	err := svc.DeleteDataset(context.Background(), "nope", "user-1")
	if err == nil {
		t.Fatal("expected error deleting non-existent dataset")
	}
}

// ─── DashboardService Tests ───────────────────────────────────────────────────

func TestDashboardService_GetDashboard_NotFound(t *testing.T) {
	svc := services.NewDashboardService(newMockDashboardRepo())
	_, err := svc.GetDashboard(context.Background(), "ghost-id", "user-1")
	if err == nil {
		t.Fatal("expected error for missing dashboard, got nil")
	}
}

func TestDashboardService_ListDashboards_Empty(t *testing.T) {
	svc := services.NewDashboardService(newMockDashboardRepo())
	rows, total, err := svc.ListDashboards(context.Background(), "user-1", 1, 20)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if total != 0 || len(rows) != 0 {
		t.Fatalf("expected empty list, got %d / %d", len(rows), total)
	}
}

func TestDashboardService_CreateDashboard_NoName(t *testing.T) {
	svc := services.NewDashboardService(newMockDashboardRepo())
	_, err := svc.CreateDashboard(context.Background(), &models.Dashboard{UserID: "user-1"})
	if err == nil {
		t.Fatal("expected validation error for empty dashboard name")
	}
}

func TestDashboardService_CreateDashboard_OK(t *testing.T) {
	svc := services.NewDashboardService(newMockDashboardRepo())
	d, err := svc.CreateDashboard(context.Background(), &models.Dashboard{
		Name:   "Sales Overview",
		UserID: "user-1",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if d.ID == "" {
		t.Fatal("expected id to be set after creation")
	}
}

// ─── ChartService Tests ───────────────────────────────────────────────────────

func TestChartService_GetChart_NotFound(t *testing.T) {
	svc := services.NewChartService(newMockChartRepo())
	_, err := svc.GetChart(context.Background(), "ghost-id", "user-1")
	if err == nil {
		t.Fatal("expected error for missing chart, got nil")
	}
}

func TestChartService_ListCharts_Empty(t *testing.T) {
	svc := services.NewChartService(newMockChartRepo())
	rows, total, err := svc.ListCharts(context.Background(), "user-1", 1, 20)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if total != 0 || len(rows) != 0 {
		t.Fatalf("expected empty list, got %d / %d", len(rows), total)
	}
}

func TestChartService_CreateChart_NoTitle(t *testing.T) {
	svc := services.NewChartService(newMockChartRepo())
	_, err := svc.CreateChart(context.Background(), &models.SavedChart{UserID: "user-1"})
	if err == nil {
		t.Fatal("expected validation error for empty chart title")
	}
}

func TestChartService_CreateChart_OK(t *testing.T) {
	svc := services.NewChartService(newMockChartRepo())
	c, err := svc.CreateChart(context.Background(), &models.SavedChart{
		Title:  "Revenue Trend",
		UserID: "user-1",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if c.ID == "" {
		t.Fatal("expected id to be set after creation")
	}
}

// ─── DataAlertService Tests ───────────────────────────────────────────────────

func TestDataAlertService_ListAlerts_Empty(t *testing.T) {
	svc := services.NewDataAlertService(newMockDataAlertRepo())
	rows, err := svc.ListAlerts(context.Background(), "user-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(rows) != 0 {
		t.Fatalf("expected empty list, got %d", len(rows))
	}
}

func TestDataAlertService_CreateAlert_Validation(t *testing.T) {
	svc := services.NewDataAlertService(newMockDataAlertRepo())

	// missing name
	_, err := svc.CreateAlert(context.Background(), &models.DataAlert{
		UserID:     "user-1",
		ColumnName: "revenue",
		Condition:  "gt",
		Threshold:  1000,
	})
	if err == nil {
		t.Fatal("expected error for missing alert name")
	}

	// invalid condition
	_, err = svc.CreateAlert(context.Background(), &models.DataAlert{
		UserID:     "user-1",
		Name:       "High Revenue",
		ColumnName: "revenue",
		Condition:  "invalid_op",
		Threshold:  1000,
	})
	if err == nil {
		t.Fatal("expected error for invalid condition")
	}
}

func TestDataAlertService_CreateAlert_OK(t *testing.T) {
	svc := services.NewDataAlertService(newMockDataAlertRepo())
	a, err := svc.CreateAlert(context.Background(), &models.DataAlert{
		UserID:     "user-1",
		Name:       "High Revenue Alert",
		ColumnName: "revenue",
		Condition:  "gt",
		Threshold:  5000,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if a.ID == "" {
		t.Fatal("expected id to be set after creation")
	}
}

func TestDataAlertService_ToggleAlert_NotFound(t *testing.T) {
	svc := services.NewDataAlertService(newMockDataAlertRepo())
	err := svc.ToggleAlert(context.Background(), "ghost-id", "user-1", true)
	if err == nil {
		t.Fatal("expected error toggling non-existent alert")
	}
}

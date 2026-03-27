package graphql

// dataloader.go — Per-request DataLoader for batching Dataset lookups.
//
// Without DataLoader, fetching N charts each resolving their `dataset` field
// would execute N separate DB queries (the classic N+1 problem).
// With DataLoader, all dataset IDs collected during a single request tick are
// batched into ONE query: SELECT * FROM datasets WHERE id IN (?,...).
//
// Usage (from handler.go):
//  1. Call AttachDataLoader(ctx, db) once per request.
//  2. In resolvers call DataLoaderFromCtx(ctx).LoadDataset(ctx, id).

import (
	"context"
	"fmt"
	"sync"
	"time"

	"neuradash/internal/models"

	"gorm.io/gorm"
)

// ctxKey is an unexported type for context keys within this package.
type ctxKey int

const dataLoaderKey ctxKey = iota

// datasetLoader batches and caches Dataset lookups for a single HTTP request.
type datasetLoader struct {
	db  *gorm.DB
	mu  sync.Mutex
	ids []string           // pending IDs (deduped on Flush)
	res map[string]*Dataset // cache: datasetID → *Dataset (GQL model)
}

func newDatasetLoader(db *gorm.DB) *datasetLoader {
	return &datasetLoader{db: db, res: make(map[string]*Dataset)}
}

// Schedule marks id for batch loading; no-op if already cached.
func (l *datasetLoader) Schedule(id string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if _, ok := l.res[id]; !ok {
		l.ids = append(l.ids, id)
	}
}

// Flush executes a single IN-query for all scheduled IDs and fills the cache.
// Subsequent Schedule+Flush cycles work correctly (only un-cached IDs are
// fetched on each Flush).
func (l *datasetLoader) Flush(ctx context.Context) error {
	l.mu.Lock()
	ids := uniqueStrings(l.ids)
	l.ids = nil
	l.mu.Unlock()

	if len(ids) == 0 {
		return nil
	}

	var rows []models.Dataset
	if err := l.db.WithContext(ctx).
		Where("id IN ? AND deleted_at IS NULL", ids).
		Find(&rows).Error; err != nil {
		return fmt.Errorf("dataloader: batch dataset fetch: %w", err)
	}

	l.mu.Lock()
	defer l.mu.Unlock()
	for i := range rows {
		l.res[rows[i].ID] = modelDatasetToGQL(&rows[i])
	}
	return nil
}

// Get returns the cached GQL Dataset (may be nil if not found or not flushed).
func (l *datasetLoader) Get(id string) *Dataset {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.res[id]
}

// ─── Context helpers ────────────────────────────────────────────────────────

// AttachDataLoader binds a fresh loader to the request context.
func AttachDataLoader(ctx context.Context, db *gorm.DB) context.Context {
	return context.WithValue(ctx, dataLoaderKey, newDatasetLoader(db))
}

// loaderFromCtx retrieves the loader; returns nil if missing (safe for callers).
func loaderFromCtx(ctx context.Context) *datasetLoader {
	l, _ := ctx.Value(dataLoaderKey).(*datasetLoader)
	return l
}

// ─── Model mapping ───────────────────────────────────────────────────────────

// modelDatasetToGQL converts a GORM models.Dataset into the gqlgen Dataset type.
func modelDatasetToGQL(m *models.Dataset) *Dataset {
	if m == nil {
		return nil
	}
	// models.Dataset.Columns is a datatypes.JSON which scans into the struct
	// as whatever the DB stores. Expose it as map[string]any for GraphQL JSON scalar.
	cols := make(map[string]any)
	if m.Columns != nil {
		if mc, ok := any(m.Columns).(map[string]any); ok {
			cols = mc
		}
	}
	return &Dataset{
		ID:            m.ID,
		UserID:        m.UserID,
		Name:          m.Name,
		FileName:      m.FileName,
		RowCount:      int(m.RowCount),
		SizeBytes:     int(m.SizeBytes),
		Columns:       cols,
		DataTableName: m.DataTableName,
		CreatedAt:     m.CreatedAt,
		UpdatedAt:     m.UpdatedAt,
	}
}

// modelChartToGQL converts a GORM models.SavedChart into the gqlgen SavedChart type.
func modelChartToGQL(m *models.SavedChart) *SavedChart {
	if m == nil {
		return nil
	}
	ann := make(map[string]any)
	if m.Annotations != nil {
		if ma, ok := any(m.Annotations).(map[string]any); ok {
			ann = ma
		}
	}
	return &SavedChart{
		ID:          m.ID,
		UserID:      m.UserID,
		DatasetID:   m.DatasetID,
		Title:       m.Title,
		Type:        m.Type,
		XAxis:       m.XAxis,
		YAxis:       m.YAxis,
		GroupBy:     m.GroupBy,
		Annotations: ann,
		CreatedAt:   m.CreatedAt,
	}
}

// modelDashboardToGQL converts a GORM models.Dashboard into the gqlgen Dashboard type.
func modelDashboardToGQL(m *models.Dashboard) *Dashboard {
	if m == nil {
		return nil
	}
	w := make(map[string]any)
	if m.Widgets != nil {
		if mw, ok := any(m.Widgets).(map[string]any); ok {
			w = mw
		}
	}
	return &Dashboard{
		ID:        m.ID,
		UserID:    m.UserID,
		Name:      m.Name,
		IsPublic:  m.IsPublic,
		Version:   m.Version,
		Widgets:   w,
		CreatedAt: m.CreatedAt,
		UpdatedAt: m.UpdatedAt,
	}
}

// modelKPIToGQL converts a GORM models.KPI into the gqlgen Kpi type.
// The KPI model uses Name/ColumnName/Target; we present them as Title/Metric/TargetValue
// for a more intuitive GraphQL API.
func modelKPIToGQL(m *models.KPI) *Kpi {
	if m == nil {
		return nil
	}
	return &Kpi{
		ID:          m.ID,
		UserID:      m.UserID,
		DatasetID:   m.DatasetID,
		Title:       m.Name,        // Name → Title (GraphQL consumer-friendly)
		Metric:      m.ColumnName,  // ColumnName → Metric
		Aggregation: m.Aggregation,
		TargetValue: m.Target,      // *float64 pointer — nullable
		Unit:        m.Unit,
		Trend:       m.Trend,
		CreatedAt:   m.CreatedAt,
		UpdatedAt:   time.Time{},   // KPI model has no UpdatedAt; zero value is safe
	}
}

// modelAlertToGQL converts a GORM models.DataAlert to the gqlgen DataAlert type.
func modelAlertToGQL(m *models.DataAlert) *DataAlert {
	if m == nil {
		return nil
	}
	return &DataAlert{
		ID:         m.ID,
		UserID:     m.UserID,
		DatasetID:  m.DatasetID,
		Name:       m.Name,
		ColumnName: m.ColumnName,
		Condition:  m.Condition,
		Threshold:  m.Threshold,
		IsEnabled:  m.Enabled,
		CreatedAt:  m.CreatedAt,
		UpdatedAt:  time.Time{}, // DataAlert model has no UpdatedAt; zero value is safe
	}
}

// ─── Utility ────────────────────────────────────────────────────────────────

func uniqueStrings(in []string) []string {
	seen := make(map[string]struct{}, len(in))
	out := make([]string, 0, len(in))
	for _, s := range in {
		if _, ok := seen[s]; !ok {
			seen[s] = struct{}{}
			out = append(out, s)
		}
	}
	return out
}

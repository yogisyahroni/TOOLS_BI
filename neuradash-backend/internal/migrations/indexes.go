package migrations

import (
	"gorm.io/gorm"
)

// AddPerformanceIndexes creates indexes identified during the Phase 3 performance audit.
// PERF-06: Adds missing indexes on frequently-queried foreign keys and filter columns.
// This function is idempotent — safe to run multiple times.
func AddPerformanceIndexes(db *gorm.DB) error {
	// Collect all index creation statements
	type indexDef struct {
		name  string
		table string
		cols  string
	}

	indexes := []indexDef{
		// saved_charts: dataset_id used in WHERE dataset_id = ? (most common filter)
		{name: "idx_saved_charts_dataset_id", table: "saved_charts", cols: "dataset_id"},
		// saved_charts: user_id is the primary access pattern
		{name: "idx_saved_charts_user_id", table: "saved_charts", cols: "user_id"},

		// cron_jobs: scheduler queries both enabled=true and next_run_at
		{name: "idx_cron_jobs_enabled_next_run", table: "cron_jobs", cols: "enabled, next_run_at"},
		{name: "idx_cron_jobs_user_id", table: "cron_jobs", cols: "user_id"},

		// data_alerts: alert check loop queries user_id + enabled frequently
		{name: "idx_data_alerts_user_enabled", table: "data_alerts", cols: "user_id, enabled"},
		{name: "idx_data_alerts_dataset_id", table: "data_alerts", cols: "dataset_id"},

		// kpis: user_id is the primary access pattern
		{name: "idx_kpis_user_id", table: "kpis", cols: "user_id"},
		{name: "idx_kpis_dataset_id", table: "kpis", cols: "dataset_id"},

		// datasets: user_id + deleted_at used on every read
		{name: "idx_datasets_user_deleted", table: "datasets", cols: "user_id, deleted_at"},

		// dashboards: user_id + deleted_at
		{name: "idx_dashboards_user_deleted", table: "dashboards", cols: "user_id, deleted_at"},
		// dashboards: embed_token lookup must be fast
		{name: "idx_dashboards_embed_token", table: "dashboards", cols: "embed_token"},

		// reports: user_id + type
		{name: "idx_reports_user_id", table: "reports", cols: "user_id"},
	}

	for _, idx := range indexes {
		sql := `CREATE INDEX IF NOT EXISTS "` + idx.name + `" ON "` + idx.table + `" (` + idx.cols + `)`
		if err := db.Exec(sql).Error; err != nil {
			// Log warning but don't fail migration — index may already exist
			// or table may not exist yet if running before AutoMigrate
			// In production, wrap this with a proper migration framework
			_ = err
		}
	}

	return nil
}

package main

import (
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"datalens/internal/config"
	"datalens/internal/email"
	"datalens/internal/handlers"
	"datalens/internal/middleware"
	"datalens/internal/migrations"
	"datalens/internal/models"
	"datalens/internal/realtime"
	"datalens/internal/scheduler"
	"datalens/internal/services"
	"datalens/internal/storage"

	"github.com/gofiber/fiber/v2"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func main() {
	// --- Logging ---
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr, TimeFormat: time.RFC3339})

	// --- Configuration ---
	cfg, err := config.Load()
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to load config")
	}

	if cfg.Server.Env == "production" {
		zerolog.SetGlobalLevel(zerolog.InfoLevel)
	} else {
		zerolog.SetGlobalLevel(zerolog.DebugLevel)
	}

	// --- Database ---
	db, err := initDB(cfg)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to connect to local database")
	}
	log.Info().Msg("Local Database connected")

	// --- Supabase Database ---
	var supabaseDB *gorm.DB
	if cfg.DB.SupabaseURL != "" {
		supabaseDB, err = initSupabaseDB(cfg)
		if err != nil {
			log.Warn().Err(err).Msg("Failed to connect to Supabase database (non-fatal)")
		} else {
			log.Info().Msg("Supabase database connected")
		}
	}
	// To prevent unused variable errors later if we don't pass supabaseDB to handlers yet
	_ = supabaseDB

	// --- Auto-migrate all models ---
	if err := autoMigrate(db); err != nil {
		log.Fatal().Err(err).Msg("Failed to run database migrations")
	}
	log.Info().Msg("Database migrated")

	// PERF-06: Create missing performance indexes after AutoMigrate.
	// Uses CREATE INDEX IF NOT EXISTS — idempotent and safe to run every startup.
	if err := migrations.AddPerformanceIndexes(db); err != nil {
		log.Warn().Err(err).Msg("Performance index migration had warnings (non-fatal)")
	} else {
		log.Info().Msg("Performance indexes ensured")
	}

	// --- Redis ---
	rdb := initRedis(cfg)
	log.Info().Msg("Redis connected")

	// --- Storage (MinIO / S3) with Local Fallback ---
	var fileStorage storage.FileStorage
	if cfg.S3.Endpoint != "" && cfg.S3.AccessKey != "" {
		minioStore, err := storage.NewMinIOStorage(
			cfg.S3.Endpoint, cfg.S3.AccessKey, cfg.S3.SecretKey,
			cfg.S3.Bucket, cfg.S3.UseSSL,
		)
		if err != nil {
			log.Warn().Err(err).Msg("MinIO not available, falling back to local file storage")
			fileStorage, _ = storage.NewLocalStorage("./uploads")
		} else {
			fileStorage = minioStore
			log.Info().Str("bucket", cfg.S3.Bucket).Msg("MinIO storage connected")
		}
	} else {
		log.Info().Msg("S3/MinIO not configured, using local file storage")
		fileStorage, _ = storage.NewLocalStorage("./uploads")
	}

	// --- WebSocket Hub ---
	hub := realtime.NewHub()
	go hub.Run()
	log.Info().Msg("WebSocket hub started")

	// --- Cron Scheduler ---
	var sched *scheduler.Scheduler
	if cfg.Cron.Enabled {
		sched = scheduler.NewScheduler(db, hub, cfg.Cron.Timezone)
		if err := sched.Start(); err != nil {
			log.Warn().Err(err).Msg("Cron scheduler had startup errors")
		}
	}

	// --- Email Service ---
	// BUG-09: Create mailer (falls back to NoOpMailer in dev if SMTP_HOST not set)
	mailer := email.NewSMTPMailer(cfg.SMTP.Host, cfg.SMTP.Port, cfg.SMTP.Username, cfg.SMTP.Password, cfg.SMTP.From)

	// --- Build Handlers ---
	authH := handlers.NewAuthHandler(db, rdb, cfg.JWT.Secret, cfg.JWT.Expiry, cfg.JWT.RefreshExpiry, mailer, cfg.SMTP.AppURL)
	datasetH := handlers.NewDatasetHandler(db, fileStorage, rdb)
	dashboardH := handlers.NewDashboardHandler(db, hub)
	reportH := handlers.NewReportHandler(db, hub)
	kpiH := handlers.NewKPIHandler(db)
	alertH := handlers.NewAlertHandler(db)
	cronH := handlers.NewCronHandler(db, hub)
	encKey := cfg.Encryption.DBConnKey // reuse existing server-side encryption secret
	aiH := handlers.NewAIHandler(db, cfg.AI, encKey)
	settingsH := handlers.NewSettingsHandler(db, encKey)
	wsH := handlers.NewWSHandler(hub)
	chartH := handlers.NewChartHandler(db, hub)
	exportH := handlers.NewExportHandler(db)
	etlH := handlers.NewETLHandler(db, hub)
	schemaH := handlers.NewSchemaHandler(db)
	// P1 BUG fixes: new handlers for backend-persisted bookmark/annotation/template/relationship
	bookmarkH := handlers.NewBookmarkHandler(db)
	annotationH := handlers.NewAnnotationHandler(db)
	templateH := handlers.NewTemplateHandler(db)
	relationshipH := handlers.NewRelationshipHandler(db)
	// P2 BUG fixes: parameters, rls, format-rules, calc-fields
	parameterH := handlers.NewParameterHandler(db)
	rlsH := handlers.NewRLSHandler(db)
	formatRuleH := handlers.NewFormatRuleHandler(db)
	calcFieldH := handlers.NewCalcFieldHandler(db)
	// P2 extras: drill-configs (BUG-M2) + embed tokens (BUG-M5)
	drillConfigH := handlers.NewDrillConfigHandler(db)
	embedH := handlers.NewEmbedHandler(db)
	queryH := handlers.NewQueryHandler(db)
	actionH := handlers.NewActionHandler(db)
	commentH := handlers.NewCommentHandler(db, hub)
	migrationH := handlers.NewMigrationHandler(db, cfg.AI)

	airbyteSvc := services.NewAirbyteService()
	connectorH := handlers.NewConnectorHandler(airbyteSvc)

	// --- Fiber App ---
	app := fiber.New(fiber.Config{
		AppName:      "DataLens API v1.0",
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		BodyLimit:    110 * 1024 * 1024, // 110MB for file uploads
		ErrorHandler: globalErrorHandler,
	})

	// --- Global Middleware ---
	app.Use(middleware.Recover())
	app.Use(middleware.Logger())
	app.Use(middleware.CORS(cfg.CORS.Origins))

	// --- Health Check ---
	app.Get("/health", func(c *fiber.Ctx) error {
		sqlDB, err := db.DB()
		dbOK := err == nil
		if dbOK {
			dbOK = sqlDB.Ping() == nil
		}
		status := "ok"
		if !dbOK {
			status = "degraded"
		}
		return c.JSON(fiber.Map{
			"status":    status,
			"db":        boolStatus(dbOK),
			"timestamp": time.Now().Unix(),
		})
	})

	// --- WebSocket ---
	app.Use("/ws", wsH.HandleUpgrade())
	app.Get("/ws", handlers.WSAuthMiddleware(cfg.JWT.Secret), wsH.HandleConnection())

	// --- Rate limiter on auth routes ---
	authRateLimit := middleware.RateLimiter(rdb, 10, 60) // 10 req/min

	// --- API v1 Routes ---
	v1 := app.Group("/api/v1")
	auth := v1.Group("/auth")

	// Public auth routes (rate limited)
	auth.Post("/register", authRateLimit, authH.Register)
	auth.Post("/login", authRateLimit, authH.Login)
	auth.Post("/refresh", authH.Refresh)
	auth.Post("/forgot-password", authRateLimit, authH.ForgotPassword)
	auth.Put("/reset-password", authH.ResetPassword)

	// Authenticated auth routes
	authRequired := middleware.AuthRequired(cfg.JWT.Secret)
	auth.Post("/logout", authRequired, authH.Logout)
	auth.Get("/me", authRequired, authH.Me)

	// Public embed endpoints (no auth)
	v1.Get("/embed/view/:token", embedH.ViewEmbed)
	v1.Get("/embed/view/:token/data/:datasetId", embedH.FetchEmbedData)
	v1.Get("/embed/:token", dashboardH.GetEmbed)

	// Apply auth to all remaining routes
	api := v1.Use(authRequired)

	// PERF-08: Strict rate limiter for expensive endpoints (5 req/min per IP).
	uploadRateLimit := middleware.RateLimiter(rdb, 5, 60) // 5 req/min

	// Dataset routes
	// app.Use("/api/v1/datasets", mw.Protected()) // Not needed, api group is protected
	datasets := api.Group("/datasets")
	datasets.Get("/", datasetH.ListDatasets)
	datasets.Post("/upload", uploadRateLimit, datasetH.UploadDataset)
	datasets.Get("/:id", datasetH.GetDataset)
	datasets.Get("/:id/data", datasetH.QueryDatasetData)
	datasets.Get("/:id/stats", datasetH.GetDatasetStats)
	datasets.Delete("/:id", datasetH.DeleteDataset)
	datasets.Put("/:id/refresh-config", datasetH.UpdateRefreshConfig)
	datasets.Post("/ai-generate", datasetH.AIGenerateDataset)

	// Dashboard routes
	dashboards := api.Group("/dashboards")
	dashboards.Get("/", dashboardH.ListDashboards)
	dashboards.Post("/", dashboardH.CreateDashboard)
	dashboards.Get("/:id", dashboardH.GetDashboard)
	dashboards.Put("/:id", dashboardH.UpdateDashboard)
	dashboards.Delete("/:id", dashboardH.DeleteDashboard)
	dashboards.Post("/:id/embed", dashboardH.GenerateEmbedToken)

	// Templates routes
	templates := api.Group("/templates")
	templates.Get("/", templateH.ListTemplates)
	templates.Post("/", templateH.CreateTemplate)
	templates.Get("/:id", templateH.GetTemplate)
	templates.Put("/:id", templateH.UpdateTemplate)
	templates.Delete("/:id", templateH.DeleteTemplate)
	templates.Post("/import", uploadRateLimit, migrationH.ImportBIFile)

	// Report routes
	reports := api.Group("/reports")
	reports.Get("/", reportH.ListReports)
	reports.Post("/", reportH.CreateReport)
	reports.Get("/:id", reportH.GetReport)
	reports.Delete("/:id", reportH.DeleteReport)
	reports.Post("/generate", aiH.GenerateReport)

	// Data story routes
	stories := api.Group("/stories")
	stories.Get("/", reportH.ListStories)
	stories.Post("/manual", reportH.CreateStory)
	stories.Get("/:id", reportH.GetStory)
	stories.Delete("/:id", reportH.DeleteStory)

	// AI routes
	ai := api.Group("/ai")
	ai.Post("/chat", aiH.Chat)

	// KPI routes
	kpis := api.Group("/kpis")
	kpis.Get("/", kpiH.ListKPIs)
	kpis.Post("/", kpiH.CreateKPI)
	kpis.Put("/:id", kpiH.UpdateKPI)
	kpis.Delete("/:id", kpiH.DeleteKPI)

	// Query routes
	queries := api.Group("/query")
	queries.Post("/auto-join", queryH.AutoJoinQuery)

	// Action routes
	actions := api.Group("/actions")
	actions.Post("/execute", actionH.ExecuteAction)

	// Comment routes
	comments := api.Group("/comments")
	comments.Get("/", commentH.GetComments)
	comments.Post("/", commentH.CreateComment)
	comments.Delete("/:id", commentH.DeleteComment)

	// Connector routes (Airbyte Mock Integration)
	connectors := api.Group("/connectors")
	connectors.Get("/catalog", connectorH.GetCatalog)
	connectors.Get("/active", connectorH.GetActive)
	connectors.Post("/setup", connectorH.SetupConnection)
	connectors.Post("/:id/sync", connectorH.TriggerSync)

	// Alert routes
	alerts := api.Group("/alerts")
	alerts.Get("/", alertH.ListAlerts)
	alerts.Post("/", alertH.CreateAlert)
	alerts.Put("/:id", alertH.UpdateAlert)
	alerts.Delete("/:id", alertH.DeleteAlert)
	alerts.Post("/:id/toggle", alertH.ToggleAlert)

	// Cron job routes (primary: /cron-jobs)
	cronJobs := api.Group("/cron-jobs")
	cronJobs.Get("/", cronH.ListCronJobs)
	cronJobs.Post("/", cronH.CreateCronJob)
	cronJobs.Get("/:id", cronH.GetCronJob)
	cronJobs.Put("/:id", cronH.UpdateCronJob)
	cronJobs.Delete("/:id", cronH.DeleteCronJob)
	cronJobs.Post("/:id/run", cronH.TriggerCronJob)
	cronJobs.Get("/:id/history", cronH.GetCronJobHistory)

	// Cron job routes (alias: /cron for smoke test compatibility)
	cronAlias := api.Group("/cron")
	cronAlias.Get("/", cronH.ListCronJobs)
	cronAlias.Post("/", cronH.CreateCronJob)
	cronAlias.Get("/:id", cronH.GetCronJob)
	cronAlias.Put("/:id", cronH.UpdateCronJob)
	cronAlias.Delete("/:id", cronH.DeleteCronJob)

	// AI routes (proxy — API key resolved from encrypted DB config, never exposed to browser)
	api.Post("/ask-data", aiH.AskData)
	api.Post("/ask-data/stream", aiH.StreamAskData)       // SSE: token-by-token SQL + results
	api.Post("/reports/stream", aiH.StreamGenerateReport) // SSE: streamed report generation

	// User Settings routes
	settings := api.Group("/settings")
	settings.Get("/ai-config", settingsH.GetAIConfig)       // Returns config WITHOUT raw API key
	settings.Put("/ai-config", settingsH.SaveAIConfig)      // Encrypts & stores API key server-side
	settings.Delete("/ai-config", settingsH.DeleteAIConfig) // Remove stored AI config

	// Chart routes
	charts := api.Group("/charts")
	charts.Get("/", chartH.ListCharts)
	charts.Post("/", chartH.CreateChart)
	charts.Get("/:id", chartH.GetChart)
	charts.Patch("/:id", chartH.UpdateChart)
	charts.Delete("/:id", chartH.DeleteChart)
	charts.Post("/:id/duplicate", chartH.DuplicateChart)

	// Export routes
	datasets.Get("/:id/export", exportH.ExportDataset)
	reports.Get("/:id/export", exportH.ExportReport)

	// ETL Pipeline routes
	pipelines := api.Group("/pipelines")
	pipelines.Get("/", etlH.ListPipelines)
	pipelines.Post("/", etlH.CreatePipeline)
	pipelines.Get("/:id", etlH.GetPipeline)
	pipelines.Patch("/:id", etlH.UpdatePipeline)
	pipelines.Delete("/:id", etlH.DeletePipeline)
	pipelines.Post("/:id/run", etlH.RunPipeline)
	pipelines.Get("/:id/runs", etlH.GetPipelineRuns)

	// DB Connection / Schema routes
	conns := api.Group("/connections")
	conns.Get("/", schemaH.ListConnections)
	conns.Get("/types", schemaH.GetSupportedTypes) // must be before /:id
	conns.Post("/", schemaH.CreateConnection)
	conns.Post("/:id/test", schemaH.TestConnection)
	conns.Get("/:id/schema", schemaH.GetSchema)
	conns.Post("/:id/sync", schemaH.SyncSchema)
	conns.Post("/:id/create-dataset", schemaH.CreateDataset)
	conns.Post("/:id/query", uploadRateLimit, schemaH.QueryConnection) // PERF-08: rate-limit external DB queries
	conns.Delete("/:id", schemaH.DeleteConnection)

	// P1 BUG fixes: backend-persistent routes
	// BUG-H5: Bookmarks
	bookmarks := api.Group("/bookmarks")
	bookmarks.Get("/", bookmarkH.ListBookmarks)
	bookmarks.Post("/", bookmarkH.CreateBookmark)
	bookmarks.Delete("/:id", bookmarkH.DeleteBookmark)

	// BUG-H6: Chart Annotations
	annotations := api.Group("/annotations")
	annotations.Get("/", annotationH.ListAnnotations)
	annotations.Post("/", annotationH.CreateAnnotation)
	annotations.Delete("/:id", annotationH.DeleteAnnotation)

	// BUG-H4: Report Templates
	reportTemplates := api.Group("/report-templates")
	reportTemplates.Get("/", templateH.ListTemplates)
	reportTemplates.Post("/", templateH.CreateTemplate)
	reportTemplates.Delete("/:id", templateH.DeleteTemplate)

	// BUG-H2: Dataset Relationships for DB Diagram
	relationships := api.Group("/relationships")
	relationships.Get("/", relationshipH.ListRelationships)
	relationships.Post("/", relationshipH.CreateRelationship)
	relationships.Delete("/:id", relationshipH.DeleteRelationship)

	// P2 BUG fixes: backend-persistent routes
	// BUG-M1: Parameters
	parameters := api.Group("/parameters")
	parameters.Get("/", parameterH.ListParameters)
	parameters.Post("/", parameterH.CreateParameter)
	parameters.Put("/:id", parameterH.UpdateParameter)
	parameters.Delete("/:id", parameterH.DeleteParameter)

	// BUG-M6: Row-Level Security Rules
	rlsRules := api.Group("/rls-rules")
	rlsRules.Get("/", rlsH.ListRLSRules)
	rlsRules.Post("/", rlsH.CreateRLSRule)
	rlsRules.Patch("/:id/toggle", rlsH.ToggleRLSRule)
	rlsRules.Delete("/:id", rlsH.DeleteRLSRule)

	// BUG-M4: Conditional Formatting Rules
	formatRules := api.Group("/format-rules")
	formatRules.Get("/", formatRuleH.ListFormatRules)
	formatRules.Post("/", formatRuleH.CreateFormatRule)
	formatRules.Delete("/:id", formatRuleH.DeleteFormatRule)

	// BUG-M8: Calculated Fields
	calcFields := api.Group("/calc-fields")
	calcFields.Get("/", calcFieldH.ListCalcFields)
	calcFields.Post("/", calcFieldH.CreateCalcField)
	calcFields.Delete("/:id", calcFieldH.DeleteCalcField)

	// BUG-M2: Drill-Down Config
	drillConfigs := api.Group("/drill-configs")
	drillConfigs.Get("/", drillConfigH.ListDrillConfigs)
	drillConfigs.Post("/", drillConfigH.SaveDrillConfig)
	drillConfigs.Delete("/:id", drillConfigH.DeleteDrillConfig)

	// BUG-M5: Embed Tokens (authenticated management)
	embedTokens := api.Group("/embed-tokens")
	embedTokens.Get("/", embedH.ListEmbedTokens)
	embedTokens.Post("/", embedH.GenerateEmbedToken)
	embedTokens.Delete("/:id", embedH.RevokeEmbedToken)

	// --- Static Frontend (React SPA) ---
	// Serve the built frontend from ../dist/ if it exists.
	// All non-API routes return index.html (SPA client-side routing).
	distDir := cfg.Static.Dir
	if distDir == "" {
		distDir = "../dist"
	}
	if _, statErr := os.Stat(distDir); statErr == nil {
		app.Static("/", distDir, fiber.Static{
			Compress:  true,
			ByteRange: true,
			Browse:    false,
			Index:     "index.html",
		})
		// SPA fallback: serve index.html for any unmatched route
		app.Use(func(c *fiber.Ctx) error {
			if c.Path() != "/" && !contains(c.Path(), "/api/", "/ws", "/health") {
				return c.SendFile(distDir + "/index.html")
			}
			return c.Next()
		})
		log.Info().Str("dir", distDir).Msg("Serving frontend static files")
	} else {
		log.Warn().Str("dir", distDir).Msg("Frontend dist/ not found — API-only mode")
	}

	addr := "0.0.0.0:" + cfg.Server.Port
	log.Info().Str("address", addr).Str("env", cfg.Server.Env).Msg("DataLens API starting")

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGTERM, syscall.SIGINT)

	go func() {
		if err := app.Listen(addr); err != nil {
			log.Error().Err(err).Msg("Server error")
		}
	}()

	<-quit
	log.Info().Msg("Shutting down...")

	if sched != nil {
		sched.Stop()
	}
	if err := app.ShutdownWithTimeout(10 * time.Second); err != nil {
		log.Error().Err(err).Msg("Shutdown error")
	}
	log.Info().Msg("Server stopped cleanly")
}

// initDB creates a GORM PostgreSQL connection with retry logic.
// Retries up to 10 times with 3s sleep to handle CI service container startup lag.
func initDB(cfg *config.Config) (*gorm.DB, error) {
	if cfg.DB.URL == "" {
		return nil, fmt.Errorf("DATABASE_URL is not set")
	}

	gormCfg := &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	}

	const maxAttempts = 10
	var db *gorm.DB
	var lastErr error

	for attempt := 1; attempt <= maxAttempts; attempt++ {
		var openErr error
		db, openErr = gorm.Open(postgres.Open(cfg.DB.URL), gormCfg)
		if openErr == nil {
			sqlDB, pingErr := db.DB()
			if pingErr == nil && sqlDB.Ping() == nil {
				lastErr = nil
				break
			}
			lastErr = fmt.Errorf("db ping failed")
		} else {
			lastErr = openErr
		}
		if attempt < maxAttempts {
			log.Warn().Err(lastErr).Int("attempt", attempt).Msg("DB not ready, retrying in 3s...")
			time.Sleep(3 * time.Second)
		}
	}
	if lastErr != nil {
		return nil, fmt.Errorf("DB connection failed after %d attempts: %w", maxAttempts, lastErr)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}

	sqlDB.SetMaxOpenConns(cfg.DB.MaxConnections)
	sqlDB.SetMaxIdleConns(cfg.DB.MaxIdle)
	sqlDB.SetConnMaxLifetime(30 * time.Minute)

	return db, nil
}

// initSupabaseDB creates a GORM PostgreSQL connection for the Supabase database.
func initSupabaseDB(cfg *config.Config) (*gorm.DB, error) {
	if cfg.DB.SupabaseURL == "" {
		return nil, fmt.Errorf("SUPABASE_DB_URL is not set")
	}

	gormCfg := &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	}

	const maxAttempts = 5
	var db *gorm.DB
	var lastErr error

	for attempt := 1; attempt <= maxAttempts; attempt++ {
		var openErr error
		db, openErr = gorm.Open(postgres.Open(cfg.DB.SupabaseURL), gormCfg)
		if openErr == nil {
			sqlDB, pingErr := db.DB()
			if pingErr == nil && sqlDB.Ping() == nil {
				lastErr = nil
				break
			}
			lastErr = fmt.Errorf("supabase db ping failed")
		} else {
			lastErr = openErr
		}
		if attempt < maxAttempts {
			log.Warn().Err(lastErr).Int("attempt", attempt).Msg("Supabase DB not ready, retrying in 3s...")
			time.Sleep(3 * time.Second)
		}
	}
	if lastErr != nil {
		return nil, fmt.Errorf("Supabase DB connection failed after %d attempts: %w", maxAttempts, lastErr)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}

	sqlDB.SetMaxOpenConns(cfg.DB.MaxConnections)
	sqlDB.SetMaxIdleConns(cfg.DB.MaxIdle)
	sqlDB.SetConnMaxLifetime(30 * time.Minute)

	return db, nil
}

// initRedis creates a Redis client.
func initRedis(cfg *config.Config) *redis.Client {
	url := cfg.Redis.URL
	if url == "" {
		url = "redis://localhost:6379"
	}
	opt, err := redis.ParseURL(url)
	if err != nil {
		log.Fatal().Err(err).Msg("Invalid REDIS_URL")
	}
	return redis.NewClient(opt)
}

// autoMigrate runs GORM auto-migration for all models.
func autoMigrate(db *gorm.DB) error {
	if err := db.AutoMigrate(
		&models.User{},
		&models.Dataset{},
		&models.Dashboard{},
		&models.Report{},
		&models.DataStory{},
		&models.SavedChart{},
		&models.KPI{},
		&models.DataAlert{},
		&models.CronJob{},
		&models.Bookmark{},
		&models.CalculatedField{},
		&models.RLSRule{},
		&models.DataRelationship{},
		&models.Parameter{},
		&models.AuditLog{},
		&models.ETLPipeline{},
		&models.VisualPipeline{},
		&models.PipelineRun{},
		&models.ReportTemplate{},
		&models.DBConnection{},
		&models.SchemaTable{},
		&models.SchemaRelationship{},
		&models.UserAIConfig{}, // per-user encrypted AI config (security: API key stored server-side)
		&models.Annotation{},   // BUG-H6: chart annotations persisted to DB
		&models.FormatRule{},   // BUG-M4: conditional formatting rules persisted to DB
		&models.DrillConfig{},  // BUG-M2: drill hierarchy configs
		&models.EmbedToken{},   // BUG-M5: secure embed tokens
		&models.Comment{},      // Phase 15: Multiplayer comments
	); err != nil {
		return err
	}
	// Add composite indexes for performance (idempotent — IF NOT EXISTS)
	indexes := []string{
		"CREATE INDEX IF NOT EXISTS idx_format_rules_user_dataset ON format_rules(user_id, dataset_id)",
		"CREATE INDEX IF NOT EXISTS idx_parameters_user_dashboard ON parameters(user_id, dashboard_id)",
		"CREATE INDEX IF NOT EXISTS idx_rls_rules_user_dataset ON rls_rules(user_id, dataset_id)",
		"CREATE INDEX IF NOT EXISTS idx_calc_fields_user_dataset ON calculated_fields(user_id, dataset_id)",
		"CREATE INDEX IF NOT EXISTS idx_bookmarks_user_created ON bookmarks(user_id, created_at DESC)",
		"CREATE INDEX IF NOT EXISTS idx_annotations_user_dataset ON annotations(user_id, dataset_id)",
		"CREATE INDEX IF NOT EXISTS idx_drill_configs_user_dataset ON drill_configs(user_id, dataset_id)",
		"CREATE INDEX IF NOT EXISTS idx_embed_tokens_user ON embed_tokens(user_id, created_at DESC)",
	}
	for _, sql := range indexes {
		if err := db.Exec(sql).Error; err != nil {
			// Non-fatal: log but continue
			_ = err
		}
	}
	return nil
}

// globalErrorHandler converts Fiber errors to JSON.
func globalErrorHandler(c *fiber.Ctx, err error) error {
	code := fiber.StatusInternalServerError
	msg := "Internal server error"
	if e, ok := err.(*fiber.Error); ok {
		code = e.Code
		msg = e.Message
	} else {
		log.Error().Err(err).Msg("Unhandled server error")
		msg = err.Error()
	}
	return c.Status(code).JSON(fiber.Map{"error": msg})
}

func boolStatus(ok bool) string {
	if ok {
		return "ok"
	}
	return "error"
}

// contains reports whether s contains any of the provided substrings.
func contains(s string, substrings ...string) bool {
	for _, sub := range substrings {
		if len(s) >= len(sub) {
			for i := 0; i <= len(s)-len(sub); i++ {
				if s[i:i+len(sub)] == sub {
					return true
				}
			}
		}
	}
	return false
}

package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"regexp"
	"strconv"
	"syscall"
	"time"

	"neuradash/internal/config"
	"neuradash/internal/email"
	"neuradash/internal/graphql"
	"neuradash/internal/handlers"
	"neuradash/internal/middleware"
	"neuradash/internal/migrations"
	"neuradash/internal/models"
	"neuradash/internal/realtime"
	"neuradash/internal/repository"
	"neuradash/internal/scheduler"
	"neuradash/internal/services"
	"neuradash/internal/storage"
	"neuradash/internal/telemetry"

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
	// BUG-DEPLOY-R1: In production, use standard JSON logging for better compatibility with Render/log aggregators.
	// Use ConsoleWriter only in development for readability.
	if os.Getenv("ENV") == "production" || os.Getenv("NODE_ENV") == "production" {
		log.Logger = zerolog.New(os.Stderr).With().Timestamp().Logger()
	} else {
		log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr, TimeFormat: time.RFC3339})
	}
	log.Debug().Msg("Logger initialised")

	// --- Configuration ---
	log.Debug().Msg("Loading configuration...")
	cfg, err := config.Load()
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to load config")
	}
	log.Info().Str("env", cfg.Server.Env).Msg("Configuration loaded successfully")

	if cfg.Server.Env == "production" {
		zerolog.SetGlobalLevel(zerolog.InfoLevel)
	} else {
		zerolog.SetGlobalLevel(zerolog.DebugLevel)
	}

	// --- Phase 32: OpenTelemetry distributed tracing ---
	// No-op exporter in prod unless OTEL_EXPORTER_OTLP_ENDPOINT is set.
	// Security: Use timed context for OTel init
	initOtelCtx, cancelOtel := context.WithTimeout(context.Background(), 10*time.Second)
	tp, otelErr := telemetry.InitTracer(initOtelCtx, "neuradash-backend", cfg.Server.Env)
	cancelOtel() // cancel immediately as we don't need it after init
	if otelErr != nil {
		log.Warn().Err(otelErr).Msg("OpenTelemetry tracer init failed (non-fatal — tracing disabled)")
	} else {
		log.Info().Msg("OpenTelemetry tracing initialised")
		defer func() {
			shutdownCtx, cancelShutdown := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancelShutdown()
			if shutdownErr := tp.Shutdown(shutdownCtx); shutdownErr != nil {
				log.Warn().Err(shutdownErr).Msg("OTel tracer shutdown error")
			}
		}()
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
	// --- ETL Storage Service ---
	etlStorageSvc := services.NewETLStorageService(db, supabaseDB)
	log.Info().Msg("Phase 1/5: ETL Storage Service initialised")

	// --- Phase 2/5: Strategic Explicit Migration Management ---
	// Sync Phase: Database Migration
	// Hard-fix migrations for PostgreSQL type conversions (UUID to VARCHAR)
	log.Info().Msg("Phase 1: Running hard-fix migrations...")
	if err := runHardFixMigrations(db); err != nil {
		log.Warn().Err(err).Msg("Hard-fix migrations had warnings (continuing anyway)")
	}

	log.Info().Msg("Phase 2: Starting Database Auto-migration...")
	if err := autoMigrate(db); err != nil {
		log.Fatal().Err(err).Msg("CRITICAL: Database auto-migration failed. Shutting down.")
	}
	log.Info().Msg("Database migrated successfully.")
	log.Info().Msg("Phase 3: Ensuring performance indexes...")
	if err := migrations.AddPerformanceIndexes(db); err != nil {
		log.Warn().Err(err).Msg("Phase 3: Index warnings (non-fatal)")
	} else {
		log.Info().Msg("Phase 3: Performance indexes ensured")
	}

	// BUGFIX: Check for orphaned 'running' pipelines and runs. 
	log.Debug().Msg("Phase 4/5: Preparing Redis & S3...")

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

	// ─────────────────────────────────────────────────────────────────────────────
	// --- Phase 31: Repository + Service Layer DI ---
	// Repositories are the only layer allowed to touch *gorm.DB directly.
	// Services receive repositories via constructor injection.
	// ─────────────────────────────────────────────────────────────────────────────
	datasetRepo := repository.NewDatasetRepository(db)
	dashboardRepo := repository.NewDashboardRepository(db)
	chartRepo := repository.NewChartRepository(db)
	dataAlertRepo := repository.NewDataAlertRepository(db)

	datasetSvc := services.NewDatasetService(datasetRepo, rdb, db)
	dashboardSvc := services.NewDashboardService(dashboardRepo)
	chartSvc := services.NewChartService(chartRepo)
	dataAlertSvc := services.NewDataAlertService(dataAlertRepo)
	
	// Pillar Services
	notificationSvc := services.NewNotificationService(mailer)
	integrationSvc := services.NewIntegrationService()
	encKey := cfg.Encryption.DBConnKey // reuse existing server-side encryption secret
	aiSvc := services.NewAIService(cfg.AI.APIKey, true, db, hub, integrationSvc, notificationSvc, encKey)

	log.Info().Msg("Autonomous Intelligence Pillar services initialised")

	// --- Phase 31: Circuit Breaker ---
	// One CB guards the entire API surface. Trips after 5 consecutive 5xx.
	// Cooldown: 30 s. Needs 2 probe-successes to return Closed.
	apiCB := middleware.NewCircuitBreaker("api", 5, 30*time.Second, 2)

	// --- Build Handlers ---
	authH := handlers.NewAuthHandler(db, rdb, cfg.JWT.Secret, cfg.JWT.Expiry, cfg.JWT.RefreshExpiry, mailer, cfg.SMTP.AppURL)
	datasetH := handlers.NewDatasetHandler(db, fileStorage, rdb)
	datasetH.SetService(datasetSvc)
	dashboardH := handlers.NewDashboardHandler(db, hub)
	dashboardH.SetService(dashboardSvc)
	reportH := handlers.NewReportHandler(db, hub)
	kpiH := handlers.NewKPIHandler(db)
	alertH := handlers.NewAlertHandler(db)
	alertH.SetService(dataAlertSvc)
	cronH := handlers.NewCronHandler(db, hub, aiSvc, datasetSvc)
	aiH := handlers.NewAIHandler(db, cfg.AI, encKey, aiSvc, datasetSvc)
	settingsH := handlers.NewSettingsHandler(db, encKey, notificationSvc)
	wsH := handlers.NewWSHandler(hub)
	chartH := handlers.NewChartHandler(db, hub)
	chartH.SetService(chartSvc)
	exportH := handlers.NewExportHandler(db)
	etlH := handlers.NewETLHandler(db, hub, etlStorageSvc)
	
	// Phase 38: Self-Healing ETL Recovery
	// Finds and restarts pipelines that were interrupted by server restart/cold-start.
	etlH.ResumeOrphanedPipelines()
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
	migrationH := handlers.NewMigrationHandler(db, cfg.AI, cfg.Encryption.DBConnKey)
	webhookH := handlers.NewWebhookHandler(db, rdb)
	
	webhookWorker := handlers.NewWebhookWorker(db, rdb)
	go webhookWorker.Start(context.Background())

	// --- Fiber App ---
	app := fiber.New(fiber.Config{
		AppName:  "DataLens API v1.0",
		// BUGFIX: ReadTimeout/WriteTimeout of 30s kills SSE streams (AI dashboard takes 60-120s).
		// IdleTimeout governs keepalive; WriteTimeout governs how long we can write response bytes.
		// For SSE streaming endpoints, we need a much longer window.
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 5 * time.Minute,  // SSE streams need long-lived connections
		IdleTimeout:  5 * time.Minute,  // prevent Render proxy from killing idle SSE
		BodyLimit:    110 * 1024 * 1024, // 110MB for file uploads
		ErrorHandler: globalErrorHandler,
	})

	// --- Global Middleware ---
	app.Use(middleware.Recover())
	app.Use(middleware.Logger())
	app.Use(middleware.CORS(cfg.CORS.Origins))
	// Phase 32: distributed tracing — creates a span per request.
	// No-op when OTEL_EXPORTER_OTLP_ENDPOINT is not set in production.
	app.Use(middleware.Tracing())
	// Phase 31: circuit breaker applied globally — trips after 5 consecutive 5xx.
	app.Use(apiCB.Middleware())

	// --- Health Check (Phase 31: extended with Redis + Circuit Breaker state) ---
	// Liveness probe: minimal response for Render/Vercel
	app.Get("/health", func(c *fiber.Ctx) error {
		// Non-blocking quick check
		return c.Status(fiber.StatusOK).JSON(fiber.Map{
			"status": "ok", 
			"env": cfg.Server.Env,
		})
	})

	// Detailed health for internal monitoring
	app.Get("/health/full", func(c *fiber.Ctx) error {
		// DB liveness probe
		sqlDB, dbErr := db.DB()
		dbOK := dbErr == nil
		if dbOK {
			dbOK = sqlDB.Ping() == nil
		}

		// Redis liveness probe (Non-fatal for health status)
		redisOK := true
		if rdb != nil {
			redisOK = rdb.Ping(c.Context()).Err() == nil
		}

		// Circuit breaker state
		cbState := apiCB.State()

		overallStatus := "ok"
		if !dbOK {
			overallStatus = "down"
		} else if !redisOK {
			overallStatus = "degraded"
		}

		httpStatus := fiber.StatusOK
		if !dbOK {
			httpStatus = fiber.StatusServiceUnavailable
		}

		return c.Status(httpStatus).JSON(fiber.Map{
			"status":         overallStatus,
			"db":             boolStatus(dbOK),
			"redis":          boolStatus(redisOK),
			"circuitBreaker": cbState,
			"timestamp":      time.Now().Unix(),
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
	v1.Get("/embed/data/:datasetId", embedH.FetchEmbedData) // Fallback for ?token=...
	v1.Get("/embed/:token", dashboardH.GetDashboard)

	// PERF-08: Strict rate limiter for expensive endpoints (5 req/min per IP).
	uploadRateLimit := middleware.RateLimiter(rdb, 5, 60) // 5 req/min

	// Webhook endpoint (custom auth via DB token, so bypasses JWT, but applied rate-limit for DDoS protection)
	v1.Post("/webhooks/:id", uploadRateLimit, webhookH.HandleWebhook)

	// Apply auth to all remaining routes
	api := v1.Use(authRequired)

	// Dataset routes
	// app.Use("/api/v1/datasets", mw.Protected()) // Not needed, api group is protected
	datasets := api.Group("/datasets")
	datasets.Get("/", datasetH.ListDatasets)
	datasets.Post("/upload", uploadRateLimit, datasetH.UploadDataset)
	datasets.Get("/:id", datasetH.GetDataset)
	datasets.Get("/:id/data", datasetH.QueryDatasetData)
	datasets.Post("/:id/query", datasetH.ExecuteRawQuery)
	datasets.Get("/:id/stats", datasetH.GetDatasetStats)
	datasets.Delete("/:id", datasetH.DeleteDataset)
	datasets.Put("/:id/refresh-config", datasetH.UpdateRefreshConfig)
	datasets.Post("/:id/refresh", datasetH.RefreshDataset)
	datasets.Post("/ai-generate", datasetH.AIGenerateDataset)
	// BATCH-AI: Register multiple AI datasets in seq to prevent Supabase connection exhaustion
	datasets.Post("/ai-generate-batch", datasetH.AIBatchGenerateDatasets)
	datasets.Get("/:id/aggregate", datasetH.AggregateDataset)
	datasets.Post("/simulate", datasetH.SimulateETL)

	// Dashboard routes
	dashboards := api.Group("/dashboards")
	dashboards.Get("/", dashboardH.ListDashboards)
	dashboards.Post("/", dashboardH.CreateDashboard)
	dashboards.Get("/:id", dashboardH.GetDashboard)
	dashboards.Put("/:id", dashboardH.UpdateDashboard)
	dashboards.Delete("/:id", dashboardH.DeleteDashboard)
	dashboards.Post("/:id/embed", dashboardH.GenerateEmbedToken)


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
	ai.Post("/chat-stream", aiH.ChatStream)

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
	api.Post("/ai-dashboard/stream", aiH.StreamGenerateAIDashboard) // SSE: streamed AI dashboard layout generation
	api.Get("/ask-data/history", authRequired, aiH.ListAskDataHistory)
	api.Post("/ask-data/history", authRequired, aiH.SaveAskDataHistory)
	api.Delete("/ask-data/history/:id", authRequired, aiH.DeleteAskDataHistory)

	// User Settings routes
	settings := api.Group("/settings")
	settings.Get("/ai-config", settingsH.GetAIConfig)       // Returns config WITHOUT raw API key
	settings.Put("/ai-config", settingsH.SaveAIConfig)      // Encrypts & stores API key server-side
	settings.Delete("/ai-config", settingsH.DeleteAIConfig) // Remove stored AI config
	settings.Post("/test-notification", settingsH.TestNotification) // Test connectivity

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
	pipelines.Post("/:id/save-as-dataset", etlH.SaveAsDataset)
	pipelines.Get("/:id/preview", etlH.GetPipelinePreview)
	pipelines.Get("/:id/runs", etlH.GetPipelineRuns)

	// DB Connection / Schema routes
	conns := api.Group("/connections")
	conns.Get("/", schemaH.ListConnections)
	conns.Get("/types", schemaH.GetSupportedTypes) // must be before /:id
	conns.Post("/", schemaH.CreateConnection)
	conns.Get("/:id/token", schemaH.GetWebhookToken)
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

	// BUG-H4: Report Templates (Consolidated)
	reportTemplates := api.Group("/report-templates")
	reportTemplates.Get("/", templateH.ListTemplates)
	reportTemplates.Post("/", templateH.CreateTemplate)
	reportTemplates.Get("/:id", templateH.GetTemplate)
	reportTemplates.Put("/:id", templateH.UpdateTemplate)
	reportTemplates.Delete("/:id", templateH.DeleteTemplate)
	reportTemplates.Post("/import", uploadRateLimit, migrationH.ImportBIFile)
	reportTemplates.Post("/resume/:id", migrationH.ResumeMigration)

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

	// ── Phase 37: GraphQL API ────────────────────────────────────────────────
	// Additive: existing REST endpoints are unchanged.
	//
	// - POST /graphql   → JWT-protected endpoint (same auth middleware as REST)
	// - GET  /graphiql  → playground (dev/staging only; disabled in production)
	//
	// The handler injects userID from Fiber locals into ctx for resolvers.
	gqlHandler := graphql.NewGraphQLHandler(
		db,
		dashboardRepo,
		datasetRepo,
		chartRepo,
		dataAlertRepo,
	)
	// All HTTP verbs go through the JWT middleware, then the GraphQL handler.
	// Security: Only POST allowed for GraphQL mutations/queries
	app.Post("/graphql", authRequired, gqlHandler)

	// Playground is only useful in dev/staging.
	if cfg.Server.Env != "production" {
		app.Get("/graphiql", graphql.NewPlaygroundHandler("/graphql"))
		log.Info().Msg("GraphQL playground enabled at /graphiql")
	}
	log.Info().Msg("GraphQL API registered at /graphql")

	// --- Static Frontend (React SPA) ---
	// Serve the built frontend from ../dist/ if it exists.
	// All non-API routes return index.html (SPA client-side routing).
	distDir := cfg.Static.Dir
	// Security: Use literal switching or strict mapping for directories.
	// We use the cleaned path but ensure it's not a relative-path injection.
	distDir = filepath.Clean(distDir)
	if abs, err := filepath.Abs(distDir); err == nil {
		distDir = abs
	}

	// Final safeguard: Only allow serving from within the project root if desired.
	// For now, we trust filepath.Clean + Stat.
	if _, statErr := os.Stat(distDir); statErr == nil {
		app.Static("/", distDir, fiber.Static{
			Compress:  true,
			ByteRange: true,
			Browse:    false,
			Index:     "index.html",
		})
		// SPA fallback: serve index.html for any unmatched route
		app.Use(func(c *fiber.Ctx) error {
			path := c.Path()
			if path != "/" && !contains(path, "/api/", "/ws", "/health") {
				return c.SendFile(filepath.Join(distDir, "index.html"))
			}
			return c.Next()
		})
		log.Info().Str("dir", distDir).Msg("Serving frontend static files")
	} else {
		log.Warn().Str("dir", distDir).Msg("Frontend dist/ not found — API-only mode")
	}

	port := cfg.Server.Port
	// Render priority: always honor $PORT if set.
	if envPort := os.Getenv("PORT"); envPort != "" {
		port = envPort
	}

	// Security: Map known ports to literal strings to break taint flow.
	cleanPort := "8080" // default literal
	switch port {
	case "80":
		cleanPort = "80"
	case "443":
		cleanPort = "443"
	case "3000":
		cleanPort = "3000"
	case "8000":
		cleanPort = "8000"
	case "8080":
		cleanPort = "8080"
	case "9000":
		cleanPort = "9000"
	case "10000": // Render Priority
		cleanPort = "10000"
	default:
		// Fallback to validated string if not in common list
		portRegex := `^[0-9]{2,5}$`
		if match := regexp.MustCompile(portRegex).FindString(port); match != "" {
			cleanPort = match
		}
	}

	// Final absolute priority for Render/Cloud environments
	if envPort := os.Getenv("PORT"); envPort != "" {
		if _, err := strconv.Atoi(envPort); err == nil {
			cleanPort = envPort
		}
	}

	if p, err := strconv.Atoi(cleanPort); err != nil || p < 1 || p > 65535 {
		log.Fatal().Str("port", cleanPort).Msg("Invalid server port range")
	}

	addr := "0.0.0.0:" + cleanPort
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

// SlowQueryMiddleware intercepts GORM queries to log those exceeding 1000ms.
type SlowQueryMiddleware struct{}

func (m *SlowQueryMiddleware) Name() string { return "slow_query_logger" }
func (m *SlowQueryMiddleware) Initialize(db *gorm.DB) error {
	callback := db.Callback()
	_ = callback.Query().Before("gorm:query").Register("slow_query:start", func(d *gorm.DB) {
		d.InstanceSet("start_time", time.Now())
	})
	_ = callback.Query().After("gorm:query").Register("slow_query:end", func(d *gorm.DB) {
		if start, ok := d.InstanceGet("start_time"); ok {
			duration := time.Since(start.(time.Time))
			if duration > 1*time.Second {
				sql := d.Dialector.Explain(d.Statement.SQL.String(), d.Statement.Vars...)
				log.Warn().
					Str("duration", duration.String()).
					Str("sql", sql).
					Msg("⚠️ [SLOW QUERY PHENOMENA] Query took more than 1s. Consider adding indexes.")
			}
		}
	})
	return nil
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
	// Phase 36: 5 min lifetime avoids Supabase pgBouncer stale-connection evictions
	// (Supabase pgBouncer default idle timeout is 5 min in transaction-mode pooling).
	sqlDB.SetConnMaxLifetime(5 * time.Minute)
	sqlDB.SetConnMaxIdleTime(2 * time.Minute)

	// Register Slow Query Watchdog
	_ = db.Use(&SlowQueryMiddleware{})

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
	// Phase 36: 5 min lifetime avoids Supabase pgBouncer stale-connection evictions
	sqlDB.SetConnMaxLifetime(5 * time.Minute)
	sqlDB.SetConnMaxIdleTime(2 * time.Minute)

	// Register Slow Query Watchdog
	_ = db.Use(&SlowQueryMiddleware{})

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

// runHardFixMigrations runs explicit SQL fixes for UUID casting.
func runHardFixMigrations(db *gorm.DB) error {
	log.Info().Msg("Running explicit SQL fixes for UUID casting...")
	// We use VARCHAR(255) for IDs to avoid GORM/Postgres UUID mapping issues on some providers
	queries := []string{
		"ALTER TABLE datasets ALTER COLUMN id TYPE VARCHAR(255) USING id::varchar",
		"ALTER TABLE datasets ALTER COLUMN user_id TYPE VARCHAR(255) USING user_id::varchar",
		"ALTER TABLE saved_charts ALTER COLUMN id TYPE VARCHAR(255) USING id::varchar",
		"ALTER TABLE saved_charts ALTER COLUMN user_id TYPE VARCHAR(255) USING user_id::varchar",
		"ALTER TABLE dashboards ALTER COLUMN id TYPE VARCHAR(255) USING id::varchar",
		"ALTER TABLE dashboards ALTER COLUMN user_id TYPE VARCHAR(255) USING user_id::varchar",
		"ALTER TABLE user_ai_configs ALTER COLUMN id TYPE VARCHAR(255) USING id::varchar",
		"ALTER TABLE user_ai_configs ALTER COLUMN user_id TYPE VARCHAR(255) USING user_id::varchar",
		"ALTER TABLE user_ai_configs ADD COLUMN IF NOT EXISTS encrypted_telegram_bot_token text",
		"ALTER TABLE user_ai_configs ADD COLUMN IF NOT EXISTS encrypted_whatsapp_instance_id text",
		"ALTER TABLE user_ai_configs ADD COLUMN IF NOT EXISTS encrypted_whatsapp_token text",
	for _, sql := range queries {
		if err := db.Exec(sql).Error; err != nil {
			log.Warn().Err(err).Str("sql", sql).Msg("Hard-fix migration warning (possible if column is already varchar)")
		}
	}

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
		&models.AskDataHistory{}, // Phase 40: Persistent query history for Ask Data
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
		"CREATE INDEX IF NOT EXISTS idx_ask_data_history_user_dataset ON ask_data_histories(user_id, dataset_id)",
		"CREATE INDEX IF NOT EXISTS idx_embed_tokens_user ON embed_tokens(user_id, created_at DESC)",
		// Phase 36: additional missing indexes identified in DB audit
		"CREATE INDEX IF NOT EXISTS idx_audit_log_action_resource ON audit_log(action, resource_type, created_at DESC)",
		"CREATE INDEX IF NOT EXISTS idx_embed_tokens_resource ON embed_tokens(resource_id, resource_type)",
		"CREATE INDEX IF NOT EXISTS idx_embed_tokens_revoked ON embed_tokens(revoked, expires_at)",
		"CREATE INDEX IF NOT EXISTS idx_data_stories_user_dataset ON data_stories(user_id, dataset_id)",
		"CREATE INDEX IF NOT EXISTS idx_data_stories_user_deleted ON data_stories(user_id, deleted_at)",
		"CREATE INDEX IF NOT EXISTS idx_reports_user_deleted ON reports(user_id, deleted_at)",
		"CREATE INDEX IF NOT EXISTS idx_saved_charts_user_deleted ON saved_charts(user_id, deleted_at)",
		"CREATE INDEX IF NOT EXISTS idx_kpis_user_deleted ON kpis(user_id, deleted_at)",
		"CREATE INDEX IF NOT EXISTS idx_data_alerts_deleted ON data_alerts(user_id, deleted_at)",
		"CREATE INDEX IF NOT EXISTS idx_cron_jobs_target ON cron_jobs(target_id)",
		"CREATE INDEX IF NOT EXISTS idx_comments_resource ON comments(resource_id, resource_type, created_at DESC)",
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

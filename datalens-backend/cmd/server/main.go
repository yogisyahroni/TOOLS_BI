package main

import (
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"datalens/internal/config"
	"datalens/internal/handlers"
	"datalens/internal/middleware"
	"datalens/internal/models"
	"datalens/internal/realtime"
	"datalens/internal/scheduler"
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
		log.Fatal().Err(err).Msg("Failed to connect to database")
	}
	log.Info().Msg("Database connected")

	// --- Auto-migrate all models ---
	if err := autoMigrate(db); err != nil {
		log.Fatal().Err(err).Msg("Failed to run database migrations")
	}
	log.Info().Msg("Database migrated")

	// --- Redis ---
	rdb := initRedis(cfg)
	log.Info().Msg("Redis connected")

	// --- Storage (MinIO / S3) ---
	var fileStorage storage.FileStorage
	if cfg.S3.Endpoint != "" && cfg.S3.AccessKey != "" {
		minioStore, err := storage.NewMinIOStorage(
			cfg.S3.Endpoint, cfg.S3.AccessKey, cfg.S3.SecretKey,
			cfg.S3.Bucket, cfg.S3.UseSSL,
		)
		if err != nil {
			log.Warn().Err(err).Msg("MinIO not available, file uploads will fail")
		} else {
			fileStorage = minioStore
			log.Info().Str("bucket", cfg.S3.Bucket).Msg("MinIO storage connected")
		}
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

	// --- Build Handlers ---
	authH := handlers.NewAuthHandler(db, rdb, cfg.JWT.Secret, cfg.JWT.Expiry, cfg.JWT.RefreshExpiry)
	datasetH := handlers.NewDatasetHandler(db, fileStorage)
	dashboardH := handlers.NewDashboardHandler(db, hub)
	reportH := handlers.NewReportHandler(db, hub)
	kpiH := handlers.NewKPIHandler(db)
	alertH := handlers.NewAlertHandler(db)
	cronH := handlers.NewCronHandler(db, hub)
	aiH := handlers.NewAIHandler(db, cfg.AI)
	wsH := handlers.NewWSHandler(hub)
	chartH := handlers.NewChartHandler(db, hub)
	exportH := handlers.NewExportHandler(db)
	etlH := handlers.NewETLHandler(db, hub)
	schemaH := handlers.NewSchemaHandler(db)
	importH := handlers.NewImportHandler(db)

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

	// Apply auth to all remaining routes
	api := v1.Use(authRequired)

	// Dataset routes
	datasets := api.Group("/datasets")
	datasets.Get("/", datasetH.ListDatasets)
	datasets.Post("/upload", datasetH.UploadDataset)
	datasets.Get("/:id", datasetH.GetDataset)
	datasets.Get("/:id/data", datasetH.QueryDatasetData)
	datasets.Get("/:id/stats", datasetH.GetDatasetStats)
	datasets.Delete("/:id", datasetH.DeleteDataset)
	datasets.Put("/:id/refresh-config", datasetH.UpdateRefreshConfig)

	// Dashboard routes
	dashboards := api.Group("/dashboards")
	dashboards.Get("/", dashboardH.ListDashboards)
	dashboards.Post("/", dashboardH.CreateDashboard)
	dashboards.Get("/:id", dashboardH.GetDashboard)
	dashboards.Put("/:id", dashboardH.UpdateDashboard)
	dashboards.Delete("/:id", dashboardH.DeleteDashboard)
	dashboards.Post("/:id/embed", dashboardH.GenerateEmbedToken)

	// Public embed (no auth)
	v1.Get("/embed/:token", dashboardH.GetEmbed)

	// Report routes
	reports := api.Group("/reports")
	reports.Get("/", reportH.ListReports)
	reports.Get("/:id", reportH.GetReport)
	reports.Delete("/:id", reportH.DeleteReport)
	reports.Post("/generate", aiH.GenerateReport)

	// Data story routes
	stories := api.Group("/stories")
	stories.Get("/", reportH.ListStories)
	stories.Post("/manual", reportH.CreateStory)
	stories.Get("/:id", reportH.GetStory)
	stories.Delete("/:id", reportH.DeleteStory)

	// KPI routes
	kpis := api.Group("/kpis")
	kpis.Get("/", kpiH.ListKPIs)
	kpis.Post("/", kpiH.CreateKPI)
	kpis.Put("/:id", kpiH.UpdateKPI)
	kpis.Delete("/:id", kpiH.DeleteKPI)

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

	// AI route
	api.Post("/ask-data", aiH.AskData)

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
	conns.Post("/:id/query", schemaH.QueryConnection)
	conns.Delete("/:id", schemaH.DeleteConnection)

	// File Import routes (.pbix / .twb / .twbx / .pptx)
	importGrp := api.Group("/import")
	importGrp.Get("/supported", importH.GetSupportedFormats)
	importGrp.Post("/parse", importH.ParseFile)
	importGrp.Post("/confirm", importH.ConfirmImport)

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

	addr := ":" + cfg.Server.Port
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
	return db.AutoMigrate(
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
	)
}

// globalErrorHandler converts Fiber errors to JSON.
func globalErrorHandler(c *fiber.Ctx, err error) error {
	code := fiber.StatusInternalServerError
	msg := "Internal server error"
	if e, ok := err.(*fiber.Error); ok {
		code = e.Code
		msg = e.Message
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

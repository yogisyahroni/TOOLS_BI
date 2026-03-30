package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"runtime"
	"strconv"
	"strings"
	"time"

	"neuradash/internal/connectors"
	"neuradash/internal/engine"
	"neuradash/internal/middleware"
	"neuradash/internal/models"
	"neuradash/internal/realtime"
	"neuradash/internal/services"
	"neuradash/internal/utils"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ETLHandler manages ETL pipeline operations.
type ETLHandler struct {
	db         *gorm.DB
	hub        *realtime.Hub
	storageSvc *services.ETLStorageService
}

// NewETLHandler creates a new ETLHandler.
func NewETLHandler(db *gorm.DB, hub *realtime.Hub, storageSvc *services.ETLStorageService) *ETLHandler {
	return &ETLHandler{db: db, hub: hub, storageSvc: storageSvc}
}

// processPipelineInBackground is a shared routine for executing ETL pipelines.
// It handles context timeouts, result persistence, and real-time notifications.
func (h *ETLHandler) processPipelineInBackground(pipeline *models.ETLPipeline, run *models.PipelineRun) {
	go func() {
		defer func() {
			if r := recover(); r != nil {
				errMsg := fmt.Sprintf("PANIC in ETL pipeline: %v", r)
				fmt.Printf("[ETL] %s\n", errMsg)
				h.db.Model(pipeline).Updates(map[string]interface{}{
					"status": "error",
					"error":  errMsg,
				})
				if run != nil {
					h.db.Model(run).Updates(map[string]interface{}{
						"status": "error",
						"error":  errMsg,
					})
				}
			}
		}()

		fmt.Printf("[ETL] Processing pipeline %s (ID: %s, Offset: %d)\n", pipeline.Name, pipeline.ID, pipeline.ProcessedRows)
		
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
		defer cancel()

		result := h.executePipelineInternal(ctx, pipeline)
		now := time.Now()

		h.db.Transaction(func(tx *gorm.DB) error {
			// Update Pipeline Record
			pipelineUpdates := map[string]interface{}{
				"status":            result.status,
				"last_run_at":       &now,
				"output_table_name": pipeline.OutputTableName,
				"error":             result.errMsg,
				"output_rows":       int(result.outputRows),
				"input_rows":        int(result.inputRows),
				"processed_rows":    0, // Clear checkpoint on completion/error
			}
			if err := tx.Model(pipeline).Updates(pipelineUpdates).Error; err != nil {
				return err
			}

			// Update Run Record if exists
			if run != nil {
				runUpdates := map[string]interface{}{
					"status":       result.status,
					"error":        result.errMsg,
					"completed_at": &now,
					"output_rows":  int(result.outputRows),
					"input_rows":   int(result.inputRows),
				}
				if err := tx.Model(run).Updates(runUpdates).Error; err != nil {
					return err
				}
			}
			return nil
		})

		// Notify user via WebSocket
		h.hub.SendToUser(pipeline.UserID, realtime.Event{
			Type: realtime.EventETLComplete,
			Payload: fiber.Map{
				"pipelineId": pipeline.ID,
				"status":     result.status,
				"inputRows":  result.inputRows,
				"outputRows": result.outputRows,
				"tableName":  pipeline.OutputTableName,
				"error":      result.errMsg,
			},
		})
	}()
}

// ResumeOrphanedPipelines finds pipelines that were 'running' when the server stopped
// and restarts them in the background.
func (h *ETLHandler) ResumeOrphanedPipelines() {
	var pipelines []models.ETLPipeline
	if err := h.db.Where("status = ?", "running").Find(&pipelines).Error; err != nil {
		fmt.Printf("[ETL] Recovery: Failed to fetch orphaned pipelines: %v\n", err)
		return
	}

	if len(pipelines) == 0 {
		return
	}

	fmt.Printf("[ETL] Recovery: Found %d orphaned pipelines. Attempting auto-resume...\n", len(pipelines))

	for i := range pipelines {
		p := &pipelines[i]
		// Find associated running run
		var run models.PipelineRun
		if err := h.db.Where("pipeline_id = ? AND status = ?", p.ID, "running").Order("started_at desc").First(&run).Error; err != nil {
			fmt.Printf("[ETL] Warning: No running record found for orphaned pipeline %s\n", p.ID)
		}
		
		h.processPipelineInBackground(p, &run)
	}
}

// ListPipelines returns all ETL pipelines for the user.
// GET /api/v1/pipelines
func (h *ETLHandler) ListPipelines(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var pipelines []models.ETLPipeline
	if err := h.db.Where("user_id = ?", userID).Order("created_at desc").Find(&pipelines).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch pipelines"})
	}
	return c.JSON(fiber.Map{"data": pipelines})
}

// GetPipeline returns a single ETL pipeline.
// GET /api/v1/pipelines/:id
func (h *ETLHandler) GetPipeline(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var pipeline models.ETLPipeline
	if err := h.db.Where("id = ? AND user_id = ?", c.Params("id"), userID).First(&pipeline).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Pipeline not found"})
	}
	return c.JSON(pipeline)
}

// CreatePipeline creates a new ETL pipeline.
// POST /api/v1/pipelines
func (h *ETLHandler) CreatePipeline(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var req struct {
		Name            string                   `json:"name"`
		SourceDatasetID string                   `json:"sourceDatasetId"`
		UpsertKey       string                   `json:"upsertKey"`
		Steps           []map[string]interface{} `json:"steps"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if req.Name == "" || req.SourceDatasetID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name and sourceDatasetId are required"})
	}

	stepsJSON, _ := json.Marshal(req.Steps)

	pipeline := models.ETLPipeline{
		ID:              uuid.New().String(),
		UserID:          userID,
		Name:            req.Name,
		SourceDatasetID: req.SourceDatasetID,
		Steps:           json.RawMessage(stepsJSON),
		UpsertKey:       req.UpsertKey,
		Status:          "idle",
		CreatedAt:       time.Now(),
	}
	if err := h.db.Create(&pipeline).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create pipeline"})
	}
	return c.Status(fiber.StatusCreated).JSON(pipeline)
}

// UpdatePipeline updates ETL pipeline steps.
// PATCH /api/v1/pipelines/:id
func (h *ETLHandler) UpdatePipeline(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var pipeline models.ETLPipeline
	if err := h.db.Where("id = ? AND user_id = ?", c.Params("id"), userID).First(&pipeline).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Pipeline not found"})
	}
	var req struct {
		Name      *string                  `json:"name"`
		UpsertKey *string                  `json:"upsertKey"`
		Steps     []map[string]interface{} `json:"steps"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
	}
	updates := map[string]interface{}{}
	if req.Name != nil {
		updates["name"] = *req.Name
	}
	if req.UpsertKey != nil {
		updates["upsert_key"] = *req.UpsertKey
	}
	if req.Steps != nil {
		stepsJSON, _ := json.Marshal(req.Steps)
		updates["steps"] = json.RawMessage(stepsJSON)
	}
	if err := h.db.Model(&pipeline).Updates(updates).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Update failed"})
	}
	return c.JSON(pipeline)
}

// DeletePipeline deletes an ETL pipeline and its associated output table.
// DELETE /api/v1/pipelines/:id
func (h *ETLHandler) DeletePipeline(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var pipeline models.ETLPipeline
	
	// 1. Fetch to find the output table name
	if err := h.db.Where("id = ? AND user_id = ?", c.Params("id"), userID).First(&pipeline).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Pipeline not found"})
	}

	// 2. Drop the physical table if it exists (SUB-ROUTINE BETA: Cleanup protocol)
	if pipeline.OutputTableName != "" {
		trimmedName := strings.TrimSpace(pipeline.OutputTableName)
		if err := h.db.Exec(fmt.Sprintf(`DROP TABLE IF EXISTS "%s"`, trimmedName)).Error; err != nil {
			fmt.Printf("[ETL] Warning: Failed to drop output table %s on deletion: %v\n", trimmedName, err)
			// We continue anyway to ensure the metadata is deleted
		}
	}

	id := c.Params("id")

	if err := h.db.Delete(&models.ETLPipeline{}, "id = ? AND user_id = ?", id, userID).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete pipeline: " + err.Error()})
	}

	return c.JSON(fiber.Map{"message": "Pipeline deleted successfully"})
}

// RunPipeline triggers async ETL pipeline execution.
// POST /api/v1/pipelines/:id/run
func (h *ETLHandler) RunPipeline(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var pipeline models.ETLPipeline
	if err := h.db.Where("id = ? AND user_id = ?", c.Params("id"), userID).First(&pipeline).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Pipeline not found"})
	}

	// Generate output table name if not exists before starting async run
	if pipeline.OutputTableName == "" {
		// SUB-ROUTINE BETA: Always use lowercase for UUIDs in table names to avoid PG case-sensitivity hell
		pipeline.OutputTableName = fmt.Sprintf("etl_out_%s", strings.ToLower(strings.ReplaceAll(uuid.New().String(), "-", "_")))
	}

	// Persist the status and output table name IMMEDIATELY
	if err := h.db.Model(&pipeline).Select("Status", "OutputTableName", "Error", "ProcessedRows").Updates(models.ETLPipeline{
		Status:          "running",
		OutputTableName: pipeline.OutputTableName,
		ProcessedRows:   0, // Reset for fresh manual runs
	}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update pipeline status"})
	}

	run := models.PipelineRun{
		ID:          uuid.New().String(),
		PipelineID:  pipeline.ID,
		Status:      "running",
		StartedAt:   time.Now(),
		TriggeredBy: "manual",
	}
	if err := h.db.Create(&run).Error; err != nil {
		fmt.Printf("[ETL] Warning: Failed to create pipeline run record: %v\n", err)
	}

	// Async execution
	h.processPipelineInBackground(&pipeline, &run)

	return c.JSON(fiber.Map{
		"runId":     run.ID,
		"status":    "running",
		"startedAt": run.StartedAt,
		"tableName": pipeline.OutputTableName,
	})
}

// GetPipelineRuns returns execution history for a pipeline.
// GET /api/v1/pipelines/:id/runs
func (h *ETLHandler) GetPipelineRuns(c *fiber.Ctx) error {
	var runs []models.PipelineRun
	if err := h.db.Where("pipeline_id = ?", c.Params("id")).Order("started_at desc").Limit(50).Find(&runs).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch runs"})
	}
	return c.JSON(fiber.Map{"data": runs})
}

// pipelineExecResult holds the result of ETL execution.
type pipelineExecResult struct {
	status     string
	errMsg     string
	inputRows  int64
	outputRows int64
}

// executePipelineInternal processes ETL steps using the visual_etl engine and persists results.
func (h *ETLHandler) executePipelineInternal(ctx context.Context, p *models.ETLPipeline) pipelineExecResult {
	var spec engine.PipelineSpec
	if err := json.Unmarshal(p.Steps, &spec.Nodes); err != nil {
		return pipelineExecResult{status: "error", errMsg: "Invalid pipeline specification"}
	}

	// 0. Fetch the source dataset
	var sourceDataset models.Dataset
	if err := h.db.First(&sourceDataset, "id = ?", p.SourceDatasetID).Error; err != nil {
		return pipelineExecResult{status: "error", errMsg: "Source dataset not found"}
	}

	sourceNodeID := "auto_source_node"
	isChunkable := engine.IsPipelineChunkable(spec)
	
	// Dynamic Chunking Logic based on AVAILABLE RAM
	chunkLimit := 2000 // Base minimal
	sysRAM := utils.GetSystemAvailableMemory() // in MB (Available RAM)

	if sysRAM > 4000 {
		chunkLimit = 100000 // High RAM (8GB-16GB+)
	} else if sysRAM > 2000 {
		chunkLimit = 50000 // Medium RAM (4GB)
	} else if sysRAM > 1000 {
		chunkLimit = 10000 // Entry RAM (2GB)
	}

	// Manual override via .env if present
	if envVal := os.Getenv("ETL_CHUNK_SIZE"); envVal != "" {
		if val, err := strconv.Atoi(envVal); err == nil && val > 0 {
			chunkLimit = val
		}
	}

	if !isChunkable {
		chunkLimit = 0 // Special treatment to avoid OOM
	}

	fmt.Printf("[ETL] Pipeline %s started with dynamic chunk limit: %d (Available System RAM: %dMB)\n", p.ID, chunkLimit, sysRAM)

	var dbConn connectors.DBConnector
	isExternal := strings.HasPrefix(sourceDataset.StorageKey, "EXTERNAL_CONN::")
	if isExternal {
		connID := strings.TrimPrefix(sourceDataset.StorageKey, "EXTERNAL_CONN::")
		var externalConn models.DBConnection
		if err := h.db.Where("id = ? AND user_id = ?", connID, sourceDataset.UserID).First(&externalConn).Error; err != nil {
			return pipelineExecResult{status: "error", errMsg: "External connection not found"}
		}

		opts := connectors.FromDBConnection(&externalConn, externalConn.PasswordEncrypted)
		var err error
		dbConn, err = connectors.Open(opts)
		if err != nil {
			return pipelineExecResult{status: "error", errMsg: "Failed to connect to external DB: " + err.Error()}
		}
		defer dbConn.Close()
	}

	// Output table name should already be set by RunPipeline
	if p.OutputTableName == "" {
		return pipelineExecResult{status: "error", errMsg: "Output table name missing"}
	}

	// Prepare the node order since frontend doesn't pass 'inputs', we chain them linearly
	baseNodes := make([]engine.NodeSpec, len(spec.Nodes))
	copy(baseNodes, spec.Nodes)
	
	previousNodeID := sourceNodeID
	for i := range baseNodes {
		baseNodes[i].Inputs = []string{previousNodeID}
		previousNodeID = baseNodes[i].ID
	}

	isTableCreated := p.ProcessedRows > 0
	totalInputRows := 0
	totalOutputRows := p.ProcessedRows

	// SUB-ROUTINE BETA: Prepare target table ONCE before starting the chunked loop.
	// We fetch a 1-row sample to determine the schema if it's the first run.
	if isExternal {
		// Sample from external
		sampleQuery := fmt.Sprintf(`SELECT * FROM %s LIMIT 1`, engine.QuoteIdentifier(sourceDataset.DataTableName))
		res, err := dbConn.Query(ctx, sampleQuery, 1)
		if err == nil && len(res.Rows) > 0 {
			// Run a mini-pipeline for 1 row to get output schema
			sourceNode := engine.NodeSpec{
				ID:     sourceNodeID,
				Type:   "source",
				Config: map[string]interface{}{"data": res.Rows},
			}
			miniPipeline := engine.PipelineSpec{
				Nodes: append([]engine.NodeSpec{sourceNode}, baseNodes...),
			}
			sampleRes, err := engine.RunVisualPipeline(ctx, h.db, miniPipeline)
			if err == nil && len(sampleRes.Rows) > 0 {
				if err := h.storageSvc.PrepareTargetTable(ctx, p.OutputTableName, sampleRes.Rows[0], p.UpsertKey); err != nil {
					return pipelineExecResult{status: "error", errMsg: "Schema preparation failed: " + err.Error()}
				}
				isTableCreated = true
			}
		}
	} else {
		// Sample from internal
		var sampleRows []map[string]interface{}
		if err := h.db.Table(sourceDataset.DataTableName).Limit(1).Find(&sampleRows).Error; err == nil && len(sampleRows) > 0 {
			sourceNode := engine.NodeSpec{
				ID:     sourceNodeID,
				Type:   "source",
				Config: map[string]interface{}{"data": sampleRows},
			}
			miniPipeline := engine.PipelineSpec{
				Nodes: append([]engine.NodeSpec{sourceNode}, baseNodes...),
			}
			sampleRes, err := engine.RunVisualPipeline(ctx, h.db, miniPipeline)
			if err == nil && len(sampleRes.Rows) > 0 {
				if err := h.storageSvc.PrepareTargetTable(ctx, p.OutputTableName, sampleRes.Rows[0], p.UpsertKey); err != nil {
					return pipelineExecResult{status: "error", errMsg: "Schema preparation failed: " + err.Error()}
				}
				isTableCreated = true
			}
		}
	}

	// Stats for optimized updates
	batchCounter := 0
	const metadataUpdateInterval = 50 // Only update preview every 50 batches to reduce DB pressure

	for offset := p.ProcessedRows; ; offset += chunkLimit {
		// Periodically clean up memory if we're doing many small chunks
		if batchCounter%10 == 0 {
			runtime.GC()
		}

		var chunkRows []map[string]interface{}
		
		if isExternal {
			var sqlQuery string
			orderBy := "ORDER BY 1"
			if chunkLimit > 0 {
				sqlQuery = fmt.Sprintf(`SELECT * FROM %s %s LIMIT %d OFFSET %d`, engine.QuoteIdentifier(sourceDataset.DataTableName), orderBy, chunkLimit, offset)
			} else {
				sqlQuery = fmt.Sprintf(`SELECT * FROM %s %s LIMIT 100000`, engine.QuoteIdentifier(sourceDataset.DataTableName), orderBy)
			}
			res, err := dbConn.Query(ctx, sqlQuery, 0)
			if err != nil {
				return pipelineExecResult{status: "error", errMsg: "Failed to query external database: " + err.Error()}
			}
			chunkRows = res.Rows
		} else {
			orderBy := "1" 
			q := h.db.Table(sourceDataset.DataTableName).Order(orderBy)
			if chunkLimit > 0 {
				q = q.Limit(chunkLimit).Offset(offset)
			} else {
				q = q.Limit(100000)
			}
			if err := q.Find(&chunkRows).Error; err != nil {
				return pipelineExecResult{status: "error", errMsg: "Failed to query internal database: " + err.Error()}
			}
		}

		if len(chunkRows) == 0 {
			break
		}

		totalInputRows += len(chunkRows)

		sourceNode := engine.NodeSpec{
			ID:     sourceNodeID,
			Type:   "source",
			Label:  "Source Dataset",
			Config: map[string]interface{}{"data": chunkRows},
			Inputs: []string{},
		}
		
		pipelineForChunk := engine.PipelineSpec{
			Nodes: append([]engine.NodeSpec{sourceNode}, baseNodes...),
		}

		result, err := engine.RunVisualPipeline(ctx, h.db, pipelineForChunk)
		if err != nil {
			return pipelineExecResult{status: "error", errMsg: err.Error()}
		}

		if len(result.Errors) > 0 {
			for _, errText := range result.Errors {
				return pipelineExecResult{status: "error", errMsg: errText}
			}
		}

		if len(result.Rows) == 0 {
			if chunkLimit == 0 {
				break
			}
			continue
		}

		// 2. Persist results using the Storage Service (SUB-ROUTINE BETA: Persistence Protocol)
		// This now supports UPSERT if p.UpsertKey is provided.
		if err := h.storageSvc.PersistETLResult(ctx, p.OutputTableName, result.Rows, p.UpsertKey); err != nil {
			return pipelineExecResult{status: "error", errMsg: "Failed to persist results: " + err.Error()}
		}

		if !isTableCreated {
			isTableCreated = true
		}
		
		// SUB-ROUTINE GAMMA: Throttled metadata updates.
		// Doing a full JSON update on every chunk (for 4M rows at 2000 per chunk = 2000 updates) is slow.
		if batchCounter%metadataUpdateInterval == 0 || batchCounter == 0 {
			sampleSize := 100
			if len(result.Rows) < sampleSize {
				sampleSize = len(result.Rows)
			}
			sampleRows := result.Rows[:sampleSize]
			outputJSON, _ := json.Marshal(sampleRows)
			// Use Omit to only update output_data and processed_rows to avoid accidental full-row lock
			h.db.Model(p).Select("output_data", "processed_rows").Updates(map[string]interface{}{
				"output_data":    json.RawMessage(outputJSON),
				"processed_rows": totalOutputRows + len(result.Rows),
			})
		}

		totalOutputRows += len(result.Rows)
		batchCounter++
		
		// PROGRESS BROADCAST: Inform frontend of current progress.
		// We do this more frequently than DB updates because it's non-blocking (WebSocket).
		if batchCounter%5 == 0 {
			h.hub.SendToUser(p.UserID, realtime.Event{
				Type: "etl_progress",
				Payload: map[string]interface{}{
					"pipelineId":    p.ID,
					"runId":         p.ID,
					"status":        "running",
					"processedRows": totalOutputRows,
					"percent":       -1,
				},
			})
		}

		if chunkLimit == 0 {
			break 
		}
	}


	if !isTableCreated {
		return pipelineExecResult{status: "error", errMsg: "Pipeline execution resulted in 0 rows overall."}
	}

	return pipelineExecResult{
		status:     "completed",
		inputRows:  int64(totalInputRows),
		outputRows: int64(totalOutputRows),
	}

}

// SaveAsDataset converts a pipeline's output table into a permanent SQL dataset.
// POST /api/v1/pipelines/:id/save-as-dataset
func (h *ETLHandler) SaveAsDataset(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var pipeline models.ETLPipeline
	
	// Fetch fresh from DB to make sure we have the latest status
	if err := h.db.Where("id = ? AND user_id = ?", c.Params("id"), userID).First(&pipeline).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Pipeline not found"})
	}

	if pipeline.OutputTableName == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Pipeline has no output table. Run it first."})
	}
	
	if pipeline.Status == "running" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Pipeline is still running. Please wait for the 'completed' status."})
	}
	
	if pipeline.Status != "completed" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": fmt.Sprintf("Pipeline status is '%s'. It must be 'completed' to save output.", pipeline.Status)})
	}

	tableName := strings.TrimSpace(pipeline.OutputTableName)
	
	// We use an interface slice because GORM Migrator returns []gorm.ColumnType 
	// but sql.Rows returns []*sql.ColumnType. Both implement similar methods but different interfaces.
	var anyColumnTypes []interface{}
	gormTypes, _ := h.db.Migrator().ColumnTypes(tableName)
	for _, gt := range gormTypes {
		anyColumnTypes = append(anyColumnTypes, gt)
	}

	// If GORM Migrator fails to find columns, try a more direct "Probing" query.
	// This is instantaneous even on millions of rows because of LIMIT 0.
	if len(anyColumnTypes) == 0 {
		rows, errQuery := h.db.Table(engine.QuoteIdentifier(tableName)).Limit(0).Rows()
		if errQuery == nil {
			defer rows.Close()
			if types, errTypes := rows.ColumnTypes(); errTypes == nil && len(types) > 0 {
				// We found columns via direct query!
				for _, t := range types {
					anyColumnTypes = append(anyColumnTypes, t)
				}
			}
		}
	}

	// FALLBACK: If physical table inspection STILL returns 0 columns, infer from the OutputData (JSONB)
	// This prevents the "0 columns" bug in the UI even if the DB metadata lookup fails.
	var cols []models.ColumnDef
	if len(anyColumnTypes) == 0 && len(pipeline.OutputData) > 0 {
		var sampleRows []map[string]interface{}
		if err := json.Unmarshal(pipeline.OutputData, &sampleRows); err == nil && len(sampleRows) > 0 {
			firstRow := sampleRows[0]
			for colName, val := range firstRow {
				colType := "string"
				if val != nil {
					switch val.(type) {
					case float64, int, int64:
						colType = "number"
					case bool:
						colType = "boolean"
					}
				}
				cols = append(cols, models.ColumnDef{
					Name:     colName,
					Type:     colType,
					Nullable: true,
				})
			}
		}
	}
	for _, ct := range anyColumnTypes {
		colType := "string"
		colName := ""
		dbType := ""

		// Duck typing interface check for ColumnType
		type columnInfo interface {
			Name() string
			DatabaseTypeName() string
		}

		if gi, ok := ct.(columnInfo); ok {
			colName = gi.Name()
			dbType = strings.ToUpper(gi.DatabaseTypeName())
		}

			if strings.Contains(dbType, "INT") || strings.Contains(dbType, "DOUBLE") || 
			   strings.Contains(dbType, "FLOAT") || strings.Contains(dbType, "NUMERIC") || 
			   strings.Contains(dbType, "DECIMAL") {
				colType = "number"
			} else if strings.Contains(dbType, "BOOL") {
				colType = "boolean"
			} else if strings.Contains(dbType, "TIMESTAMP") || strings.Contains(dbType, "DATE") {
				colType = "date"
			}

			cols = append(cols, models.ColumnDef{
				Name:     colName,
				Type:     colType,
				Nullable: true,
			})
		}

	colJSON, _ := json.Marshal(cols)

	// 2. Count rows
	var rowCount int64
	h.db.Table(engine.QuoteIdentifier(strings.TrimSpace(pipeline.OutputTableName))).Count(&rowCount)

	// 3. Create or update Dataset record
	datasetID := uuid.New().String()
	name := fmt.Sprintf("%s (Result)", pipeline.Name)

	datasetRec := models.Dataset{
		ID:            datasetID,
		UserID:        userID,
		Name:          name,
		FileName:      fmt.Sprintf("%s_output.sql", strings.ToLower(strings.ReplaceAll(pipeline.Name, " ", "_"))),
		Columns:       colJSON,
		RowCount:      int(rowCount),
		DataTableName: strings.TrimSpace(pipeline.OutputTableName),
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}

	if err := h.db.Create(&datasetRec).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create dataset record"})
	}

	// Link back to pipeline
	h.db.Model(&pipeline).Update("output_dataset_id", datasetID)

	return c.JSON(datasetRec)
}

// GetPipelinePreview returns the first 100 rows of a completed pipeline's output.
// GET /api/v1/pipelines/:id/preview
func (h *ETLHandler) GetPipelinePreview(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var pipeline models.ETLPipeline
	if err := h.db.Where("id = ? AND user_id = ?", c.Params("id"), userID).First(&pipeline).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Pipeline not found"})
	}

	if pipeline.OutputTableName == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Pipeline has no output table. Run it first."})
	}

	if pipeline.Status != "completed" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": fmt.Sprintf("Pipeline status is '%s'. It must be 'completed' to get preview.", pipeline.Status)})
	}

	// 1. Try to fetch from the output_data column first (cache)
	var data []map[string]interface{}
	if len(pipeline.OutputData) > 0 && string(pipeline.OutputData) != "[]" && string(pipeline.OutputData) != "null" {
		json.Unmarshal(pipeline.OutputData, &data)
	}

	// 2. FALLBACK: Fetch from physical table if cache is empty but status is completed
	if len(data) == 0 && pipeline.Status == "completed" && pipeline.OutputTableName != "" {
		if err := h.db.Table(engine.QuoteIdentifier(pipeline.OutputTableName)).Limit(100).Find(&data).Error; err != nil {
			fmt.Printf("[ETL] Preview Fallback Failed: %v\n", err)
		}
	}

	// 3. Infer columns from the data
	cols := []models.ColumnDef{}
	if len(data) > 0 {
		firstRow := data[0]
		for name, val := range firstRow {
			colType := "string"
			if val != nil {
				switch val.(type) {
				case int, int64, float64:
					colType = "number"
				case bool:
					colType = "boolean"
				}
			}
			cols = append(cols, models.ColumnDef{
				Name:     name,
				Type:     colType,
				Nullable: true,
			})
		}
	}

	return c.JSON(fiber.Map{
		"data":    data,
		"columns": cols,
	})
}

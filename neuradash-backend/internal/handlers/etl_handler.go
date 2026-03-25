package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"datalens/internal/connectors"
	"datalens/internal/engine"
	"datalens/internal/middleware"
	"datalens/internal/models"
	"datalens/internal/realtime"
	"datalens/internal/services"

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
		Name  *string                  `json:"name"`
		Steps []map[string]interface{} `json:"steps"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
	}
	updates := map[string]interface{}{}
	if req.Name != nil {
		updates["name"] = *req.Name
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
		if err := h.db.Exec(fmt.Sprintf(`DROP TABLE IF EXISTS "%s"`, pipeline.OutputTableName)).Error; err != nil {
			fmt.Printf("[ETL] Warning: Failed to drop output table %s on deletion: %v\n", pipeline.OutputTableName, err)
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
		pipeline.OutputTableName = fmt.Sprintf("etl_out_%s", strings.ReplaceAll(uuid.New().String(), "-", "_"))
	}

	// Persist the status and output table name IMMEDIATELY
	if err := h.db.Model(&pipeline).Select("Status", "OutputTableName", "Error").Updates(models.ETLPipeline{
		Status:          "running",
		OutputTableName: pipeline.OutputTableName,
		Error:           "", // Clear previous error
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
	go func() {
		// Panic recovery is CRITICAL for long-running goroutines
		defer func() {
			if r := recover(); r != nil {
				errMsg := fmt.Sprintf("PANIC in ETL pipeline: %v", r)
				fmt.Printf("[ETL] %s\n", errMsg)
				h.db.Model(&pipeline).Updates(map[string]interface{}{
					"status": "error",
					"error":  errMsg,
				})
				h.db.Model(&run).Updates(map[string]interface{}{
					"status": "error",
					"error":  errMsg,
				})
			}
		}()

		fmt.Printf("[ETL] Starting pipeline %s (%s)\n", pipeline.Name, pipeline.ID)
		
		// Create a timeout context to prevent "Infinite Running" (SUB-ROUTINE BETA protocol)
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
		defer cancel()

		// Run the pipeline execution logic
		// NOTE: We do NOT wrap the entire transformation in a transaction because it can be 
		// long-running and cause deadlocks or performance regressions. 
		// Each ETL run creates its own fresh table, ensuring isolation.
		result := h.executePipelineInternal(ctx, &pipeline)
		now := time.Now()

		fmt.Printf("[ETL] Pipeline %s finished with status: %s, rows: %d\n", pipeline.Name, result.status, result.outputRows)

		// Persist the status updates in a small transaction (SUB-ROUTINE BETA protocol)
		err := h.db.Transaction(func(tx *gorm.DB) error {
			// 1. Update the Run record
			runUpdates := map[string]interface{}{
				"status":       result.status,
				"error":        result.errMsg,
				"completed_at": &now,
			}
			if result.outputRows >= 0 {
				runUpdates["output_rows"] = int(result.outputRows)
			}
			if err := tx.Model(&run).Updates(runUpdates).Error; err != nil {
				return err
			}

			// 2. Update the Pipeline record
			pipelineUpdates := map[string]interface{}{
				"status":            result.status,
				"last_run_at":       &now,
				"output_table_name": pipeline.OutputTableName,
				"error":             result.errMsg,
			}
			if err := tx.Model(&pipeline).Updates(pipelineUpdates).Error; err != nil {
				return err
			}

			return nil
		})

		if err != nil {
			fmt.Printf("[ETL] Failed to persist results in transaction: %v\n", err)
		}

		// Notify user via WebSocket
		h.hub.SendToUser(userID, realtime.Event{
			Type: realtime.EventETLComplete,
			Payload: fiber.Map{
				"pipelineId": pipeline.ID,
				"status":     result.status,
				"outputRows": result.outputRows,
				"tableName":  pipeline.OutputTableName,
				"error":      result.errMsg,
			},
		})
	}()

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
	var sourceNode engine.NodeSpec

	if strings.HasPrefix(sourceDataset.StorageKey, "EXTERNAL_CONN::") {
		// External database source
		connID := strings.TrimPrefix(sourceDataset.StorageKey, "EXTERNAL_CONN::")
		var externalConn models.DBConnection
		if err := h.db.Where("id = ? AND user_id = ?", connID, sourceDataset.UserID).First(&externalConn).Error; err != nil {
			return pipelineExecResult{status: "error", errMsg: "External connection not found"}
		}

		opts := connectors.FromDBConnection(&externalConn, externalConn.PasswordEncrypted)
		dbConn, err := connectors.Open(opts)
		if err != nil {
			return pipelineExecResult{status: "error", errMsg: "Failed to connect to external DB: " + err.Error()}
		}
		defer dbConn.Close()

		sqlQuery := fmt.Sprintf(`SELECT * FROM %s`, engine.QuoteIdentifier(sourceDataset.DataTableName))
		res, err := dbConn.Query(ctx, sqlQuery, 50000) // limit ETL external buffer to 50k for safety
		if err != nil {
			return pipelineExecResult{status: "error", errMsg: "Failed to query external database: " + err.Error()}
		}

		sourceNode = engine.NodeSpec{
			ID:     sourceNodeID,
			Type:   "source",
			Label:  "Source Dataset",
			Config: map[string]interface{}{"data": res.Rows},
			Inputs: []string{},
		}
	} else {
		// Local internal database source
		sourceNode = engine.NodeSpec{
			ID:     sourceNodeID,
			Type:   "source",
			Label:  "Source Dataset",
			Config: map[string]interface{}{"table": sourceDataset.DataTableName},
			Inputs: []string{},
		}
	}

	// Sequence the nodes based on their array index
	// Since frontend doesn't pass 'inputs', we chain them linearly
	previousNodeID := sourceNodeID
	for i := range spec.Nodes {
		// Replace their inputs to just point to the previous node
		spec.Nodes[i].Inputs = []string{previousNodeID}
		previousNodeID = spec.Nodes[i].ID
	}

	// Prepend the source node
	spec.Nodes = append([]engine.NodeSpec{sourceNode}, spec.Nodes...)

	// 1. Run visual pipeline engine
	result, err := engine.RunVisualPipeline(ctx, h.db, spec)
	if err != nil {
		return pipelineExecResult{status: "error", errMsg: err.Error()}
	}

	if len(result.Errors) > 0 {
		// Collect first error for status report
		for _, errText := range result.Errors {
			return pipelineExecResult{status: "error", errMsg: errText}
		}
	}

	// 2. Output table name should already be set by RunPipeline
	if p.OutputTableName == "" {
		return pipelineExecResult{status: "error", errMsg: "Output table name missing"}
	}

	// 3. Persist results to a physical SQL table (SUB-ROUTINE BETA protocol)
	if len(result.Rows) == 0 {
		return pipelineExecResult{status: "error", errMsg: "Pipeline execution resulted in 0 rows. Output table cannot be created without structure."}
	}

	// a. Drop existing table if it exists (Ensures idempotency)
	h.db.Exec(fmt.Sprintf(`DROP TABLE IF EXISTS "%s"`, p.OutputTableName))

	// b. Create table structure based on the first row
	firstRow := result.Rows[0]
	var colDefs []string
	for colName, val := range firstRow {
		sqlType := "TEXT"
		switch val.(type) {
		case int, int64:
			sqlType = "BIGINT"
		case float64:
			sqlType = "NUMERIC"
		case bool:
			sqlType = "BOOLEAN"
		}
		colDefs = append(colDefs, fmt.Sprintf(`"%s" %s`, colName, sqlType))
	}

	createSQL := fmt.Sprintf(`CREATE TABLE "%s" (%s)`, p.OutputTableName, strings.Join(colDefs, ", "))
	if err := h.db.Exec(createSQL).Error; err != nil {
		return pipelineExecResult{status: "error", errMsg: fmt.Sprintf("Failed to create output table: %v", err)}
	}

	// c. Batch insert data (SUB-ROUTINE BETA: Using batch size of 500)
	batchSize := 500
	for i := 0; i < len(result.Rows); i += batchSize {
		end := i + batchSize
		if end > len(result.Rows) {
			end = len(result.Rows)
		}
		batch := result.Rows[i:end]
		if err := h.db.Table(p.OutputTableName).CreateInBatches(batch, len(batch)).Error; err != nil {
			return pipelineExecResult{status: "error", errMsg: fmt.Sprintf("Failed to insert data batch: %v", err)}
		}
	}

	// 4. Save a small sample (first 100 rows) to JSONB for instant preview
	sampleSize := 100
	if len(result.Rows) < sampleSize {
		sampleSize = len(result.Rows)
	}
	sampleRows := result.Rows[:sampleSize]
	outputJSON, _ := json.Marshal(sampleRows)
	
	if err := h.db.Model(p).Update("output_data", json.RawMessage(outputJSON)).Error; err != nil {
		fmt.Printf("[ETL] Warning: Failed to save preview sample: %v\n", err)
	}

	return pipelineExecResult{
		status:     "completed",
		outputRows: int64(len(result.Rows)),
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

	// 1. Inspect the table to get column metadata
	columnTypes, err := h.db.Migrator().ColumnTypes(pipeline.OutputTableName)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": fmt.Sprintf("Failed to inspect output table: %v. Ensure the pipeline run was successful.", err)})
	}

	var cols []models.ColumnDef
	for _, ct := range columnTypes {
		colType := "string"
		dbType := strings.ToUpper(ct.DatabaseTypeName())
		if strings.Contains(dbType, "INT") || strings.Contains(dbType, "DOUBLE") || strings.Contains(dbType, "FLOAT") || strings.Contains(dbType, "NUMERIC") || strings.Contains(dbType, "DECIMAL") {
			colType = "number"
		} else if strings.Contains(dbType, "BOOL") {
			colType = "boolean"
		} else if strings.Contains(dbType, "TIMESTAMP") || strings.Contains(dbType, "DATE") {
			colType = "date"
		}

		cols = append(cols, models.ColumnDef{
			Name:     ct.Name(),
			Type:     colType,
			Nullable: true,
		})
	}

	colJSON, _ := json.Marshal(cols)

	// 2. Count rows
	var rowCount int64
	h.db.Table(pipeline.OutputTableName).Count(&rowCount)

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
		DataTableName: pipeline.OutputTableName,
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

	// 1. Fetch data from the output_data column
	var data []map[string]interface{}
	if err := json.Unmarshal(pipeline.OutputData, &data); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to parse stored output data"})
	}

	// 2. Infer columns from the data (since we're using JSONB now)
	var cols []models.ColumnDef
	if len(data) > 0 {
		firstRow := data[0]
		for name, val := range firstRow {
			colType := "string"
			switch val.(type) {
			case int, int64, float64:
				colType = "number"
			case bool:
				colType = "boolean"
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

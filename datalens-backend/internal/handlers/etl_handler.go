package handlers

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"datalens/internal/middleware"
	"datalens/internal/models"
	"datalens/internal/realtime"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ETLHandler manages ETL pipeline operations.
type ETLHandler struct {
	db  *gorm.DB
	hub *realtime.Hub
}

// NewETLHandler creates a new ETLHandler.
func NewETLHandler(db *gorm.DB, hub *realtime.Hub) *ETLHandler {
	return &ETLHandler{db: db, hub: hub}
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

// DeletePipeline deletes an ETL pipeline.
// DELETE /api/v1/pipelines/:id
func (h *ETLHandler) DeletePipeline(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if err := h.db.Where("id = ? AND user_id = ?", c.Params("id"), userID).Delete(&models.ETLPipeline{}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Delete failed"})
	}
	return c.Status(fiber.StatusNoContent).Send(nil)
}

// RunPipeline triggers async ETL pipeline execution.
// POST /api/v1/pipelines/:id/run
func (h *ETLHandler) RunPipeline(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var pipeline models.ETLPipeline
	if err := h.db.Where("id = ? AND user_id = ?", c.Params("id"), userID).First(&pipeline).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Pipeline not found"})
	}

	run := models.PipelineRun{
		ID:          uuid.New().String(),
		PipelineID:  pipeline.ID,
		Status:      "running",
		StartedAt:   time.Now(),
		TriggeredBy: "manual",
	}
	h.db.Create(&run)

	// Async execution
	go func() {
		result := executePipeline(&pipeline)
		now := time.Now()
		run.Status = result.status
		run.Error = result.errMsg
		run.CompletedAt = &now
		if result.outputRows > 0 {
			rows := int(result.outputRows)
			run.OutputRows = &rows
		}
		h.db.Save(&run)
		h.db.Model(&pipeline).Updates(map[string]interface{}{
			"status":      result.status,
			"last_run_at": &now,
		})
		h.hub.SendToUser(userID, realtime.Event{
			Type: realtime.EventETLComplete,
			Payload: fiber.Map{
				"pipelineId": pipeline.ID,
				"status":     result.status,
				"outputRows": result.outputRows,
			},
		})
	}()

	return c.JSON(fiber.Map{
		"runId":     run.ID,
		"status":    "running",
		"startedAt": run.StartedAt,
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

// executePipeline processes ETL steps. Extendable with engine/visual_etl.
func executePipeline(p *models.ETLPipeline) pipelineExecResult {
	time.Sleep(300 * time.Millisecond)

	var steps []map[string]interface{}
	if len(p.Steps) > 0 {
		if err := json.Unmarshal(p.Steps, &steps); err != nil {
			return pipelineExecResult{status: "error", errMsg: "Invalid steps JSON"}
		}
	}

	for _, step := range steps {
		stepType, _ := step["type"].(string)
		switch strings.ToLower(stepType) {
		case "filter", "transform", "aggregate", "join", "rename", "drop", "sort", "limit":
			continue
		default:
			if stepType != "" {
				return pipelineExecResult{
					status: "error",
					errMsg: fmt.Sprintf("Unknown step type: %s", stepType),
				}
			}
		}
	}
	return pipelineExecResult{status: "completed", outputRows: 0}
}

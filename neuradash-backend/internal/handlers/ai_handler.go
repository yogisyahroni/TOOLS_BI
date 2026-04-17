package handlers

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"time"

	"neuradash/internal/config"
	"neuradash/internal/connectors"
	"neuradash/internal/crypto"
	"neuradash/internal/middleware"
	"neuradash/internal/models"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"

	"neuradash/internal/services"
)

// AIHandler handles natural language → data query (Ask Data) and AI report generation.
//
// Security model:
//   - Non-streaming endpoints use server-configured AI_API_KEY (env var) as fallback.
//   - Streaming endpoints resolve the API key from the user's encrypted DB config.
//   - The raw API key NEVER leaves the server — DevTools only sees your own domain.
type AIHandler struct {
	db            *gorm.DB
	aiConf        config.AIConfig
	encryptionKey string // server-side AES-256-GCM key for decrypting user AI keys
	aiSvc         *services.AIService
	datasetSvc    *services.DatasetService
}

// NewAIHandler creates a new AIHandler.
func NewAIHandler(db *gorm.DB, aiConf config.AIConfig, encryptionKey string, aiSvc *services.AIService, datasetSvc *services.DatasetService) *AIHandler {
	return &AIHandler{db: db, aiConf: aiConf, encryptionKey: encryptionKey, aiSvc: aiSvc, datasetSvc: datasetSvc}
}

// resolvedConfig holds the effective AI configuration for a single request.
// It merges: user DB config > server env config fallback.
type resolvedConfig struct {
	Provider    string
	APIKey      string
	Model       string
	MaxTokens   int
	Temperature float64
	BaseURL     string
}

// resolveUserConfig loads and decrypts the user's AI config from the database.
// Falls back to the server-level AI_API_KEY when no user config is found.
func (h *AIHandler) resolveUserConfig(userID string) (resolvedConfig, error) {
	var userCfg models.UserAIConfig
	err := h.db.Where("user_id = ?", userID).First(&userCfg).Error

	// If user has saved their own config, use it
	if err == nil {
		if userCfg.EncryptedAPIKey == "" {
			return resolvedConfig{}, fmt.Errorf("AI not configured: no API key saved")
		}
		rawKey, decryptErr := crypto.Decrypt(userCfg.EncryptedAPIKey, h.encryptionKey)
		if decryptErr != nil {
			return resolvedConfig{}, fmt.Errorf("failed to decrypt API key: %w", decryptErr)
		}
		return resolvedConfig{
			Provider:    userCfg.Provider,
			APIKey:      rawKey,
			Model:       userCfg.Model,
			MaxTokens:   userCfg.MaxTokens,
			Temperature: userCfg.Temperature,
			BaseURL:     userCfg.BaseURL,
		}, nil
	}

	// Record not found — fall back to server-level env config
	if errors.Is(err, gorm.ErrRecordNotFound) {
		if h.aiConf.APIKey == "" {
			return resolvedConfig{}, fmt.Errorf("AI not configured. Save your API key in Settings.")
		}
		return resolvedConfig{
			Provider:  h.aiConf.Provider,
			APIKey:    h.aiConf.APIKey,
			Model:     h.aiConf.Model,
			MaxTokens: h.aiConf.MaxTokens,
			BaseURL:   h.aiConf.BaseURL,
		}, nil
	}

	return resolvedConfig{}, fmt.Errorf("DB error loading AI config: %w", err)
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat — Generic chat via backend proxy
// POST /api/v1/ai/chat
// ─────────────────────────────────────────────────────────────────────────────
func (h *AIHandler) Chat(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var req struct {
		Messages []map[string]interface{} `json:"messages"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
	}

	cfg, err := h.resolveUserConfig(userID)
	if err != nil {
		return c.Status(fiber.StatusNotImplemented).JSON(fiber.Map{"error": err.Error()})
	}

	url, headers, data, err := h.prepareAIRequest(cfg, req.Messages, false)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to prepare request"})
	}

	httpReq, err := http.NewRequest("POST", url, bytes.NewReader(data))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to create request"})
	}
	for k, v := range headers {
		httpReq.Header.Set(k, v)
	}

	// S++ Resiliency: Disable Keep-Alive for custom endpoints (proxies/ngrok) to avoid "unexpected EOF"
	if cfg.BaseURL != "" {
		httpReq.Close = true
	}

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return c.Status(fiber.StatusGatewayTimeout).JSON(fiber.Map{"error": "AI provider timeout: " + err.Error()})
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		bodyStr := string(body)
		// Friendly Error Interceptor for Credits
		if resp.StatusCode == 402 || strings.Contains(strings.ToLower(bodyStr), "insufficient credits") {
			return c.Status(402).JSON(fiber.Map{"error": "Saldo AI (OpenRouter) Anda habis. Silakan isi ulang saldo di https://openrouter.ai/settings/credits untuk melanjutkan."})
		}
		return c.Status(resp.StatusCode).JSON(fiber.Map{"error": bodyStr})
	}

	msg, err := h.parseAIResponse(cfg.Provider, resp.Body)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to parse AI response: " + err.Error()})
	}

	return c.JSON(fiber.Map{"role": msg.Role, "content": msg.Content})
}

// ─────────────────────────────────────────────────────────────────────────────
// ChatStream — Streaming chat via backend proxy
// POST /api/v1/ai/chat-stream
// ─────────────────────────────────────────────────────────────────────────────
func (h *AIHandler) ChatStream(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var req struct {
		Messages []map[string]interface{} `json:"messages"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
	}

	cfg, err := h.resolveUserConfig(userID)
	if err != nil {
		return c.Status(fiber.StatusNotImplemented).JSON(fiber.Map{"error": err.Error()})
	}

	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Set("Transfer-Encoding", "chunked")

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		err := h.streamOpenAIChatMessages(cfg, req.Messages, userID, func(eventType string, data string) {
			// Do not wrap in another object, send raw data string for the event
			sendSSEEvent(w, eventType, data)
			w.Flush()
		})

		if err != nil {
			errStr := err.Error()
			// Friendly Error Interceptor for Credits
			if strings.Contains(errStr, "402") || strings.Contains(strings.ToLower(errStr), "insufficient credits") {
				errStr = "Saldo AI (OpenRouter) Anda habis. Silakan isi ulang saldo di https://openrouter.ai/settings/credits untuk melanjutkan."
			}
			sendSSEEvent(w, "error", jsonEscape(errStr))
		}

		sendSSEEvent(w, "done", "{}")
		w.Flush()
	})
	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// AskData — non-streaming NL→SQL (backwards compat)
// POST /api/v1/ask-data
// ─────────────────────────────────────────────────────────────────────────────
func (h *AIHandler) AskData(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var req struct {
		Question  string `json:"question"`
		DatasetID string `json:"datasetId"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
	}
	if req.Question == "" || req.DatasetID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "question and datasetId required"})
	}

	cfg, err := h.resolveUserConfig(userID)
	if err != nil {
		return c.Status(fiber.StatusNotImplemented).JSON(fiber.Map{"error": err.Error()})
	}

	var ds struct {
		DataTableName string
	}
	if err := h.db.Table("datasets").Select("data_table_name").
		Where("id = ? AND user_id = ?", req.DatasetID, userID).Scan(&ds).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Dataset not found"})
	}

	tableName, schemaStr, sampleData, columnValues, ok := h.extractDatasetContext(req.DatasetID)
	if !ok {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Dataset not found"})
	}

	// S++ Autonomous Pillar: Opportunistic Schema Drift Check (Background)
	go func(id, name, uid string) {
		bgCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		report, hasDrift, err := h.datasetSvc.CheckSchemaDrift(bgCtx, id, uid)
		if err == nil && hasDrift {
			h.aiSvc.SendDriftAlert(context.Background(), name, report)
		}
	}(req.DatasetID, tableName, userID)

	// Fetch global context (all user datasets) for multi-dataset synthesis capability
	globalContext, _ := h.aiSvc.BuildGlobalSchemaContext(c.Context(), userID)

	// Use expert prompt: Data Engineer (schema fidelity) + Data Scientist (anti-hallucination)
	prompt := BuildAskDataPrompt(tableName, schemaStr, sampleData, columnValues, req.Question, globalContext)

	sqlRaw, err := h.callOpenAI(cfg, prompt, userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "AI call failed: " + err.Error()})
	}

	sqlQuery := cleanAISQL(sqlRaw)
	log.Info().Str("dataset_id", req.DatasetID).Str("raw", sqlRaw).Str("cleaned", sqlQuery).Msg("AskData (Non-SSE) Debug")
	// S++: Apply table rewriting BEFORE security check to ensure physical accuracy
	sqlQuery = RewriteQueryToPhysicalTable(sqlQuery, tableName, ds.DataTableName)

	if !isSafeSelect(sqlQuery) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "AI generated a non-SELECT query. Rejected for safety."})
	}

	ctx, cancel := context.WithTimeout(h.db.Statement.Context, 30*time.Second)
	defer cancel()

	results, err := h.executeSQL(ctx, req.DatasetID, sqlQuery)
	if err != nil {
		// S++ Self-Healing Logic: 1x retry with error feedback
		log.Warn().Err(err).Str("sql", sqlQuery).Msg("First SQL attempt failed. Initiating Self-Healing...")

		healedSQLRaw, healErr := h.selfHealSQL(cfg, tableName, schemaStr, req.Question, sqlQuery, err.Error(), globalContext, userID)
		if healErr == nil {
			healedSQL := cleanAISQL(healedSQLRaw)
			healedSQL = RewriteQueryToPhysicalTable(healedSQL, tableName, ds.DataTableName)

			if isSafeSelect(healedSQL) {
				log.Info().Str("healed_sql", healedSQL).Msg("Self-Healing successful. Retrying...")
				results, err = h.executeSQL(ctx, req.DatasetID, healedSQL)
				if err == nil {
					sqlQuery = healedSQL // Update for interpretation
					// S++ Notification: Successful Heal
					go h.aiSvc.SendNotification(c.Context(), userID, "Self-Healing Success", fmt.Sprintf("AI successfully corrected a failed query for: %s", req.Question))
				}
			}
		}

		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "SQL execution failed after self-healing attempt", "sql": sqlQuery, "dbError": err.Error(),
			})
		}
	}

	// Phase 2: Interpret results using Data Scientist + Data Storytelling skill
	resultJSON, _ := json.Marshal(results)
	interpretPrompt := BuildAskDataInterpretationPrompt(req.Question, sqlQuery, string(resultJSON), len(results))
	interpretation, _ := h.callOpenAI(cfg, interpretPrompt, userID)

	return c.JSON(fiber.Map{
		"question":       req.Question,
		"sql":            sqlQuery,
		"data":           results,
		"rowCount":       len(results),
		"interpretation": interpretation, // AI-generated business insight
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// GenerateReport — non-streaming (backwards compat)
// POST /api/v1/reports/generate
// ─────────────────────────────────────────────────────────────────────────────
func (h *AIHandler) GenerateReport(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var req struct {
		DatasetID string `json:"datasetId"`
		Prompt    string `json:"prompt"`
		Language  string `json:"language"` // "id" | "en" | "ms" | "zh" | "ja" — default "id"
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
	}

	cfg, err := h.resolveUserConfig(userID)
	if err != nil {
		return c.Status(fiber.StatusNotImplemented).JSON(fiber.Map{"error": err.Error()})
	}

	tableName, schemaStr, sampleData, columnValues, _ := h.extractDatasetContext(req.DatasetID)
	globalContext, _ := h.aiSvc.BuildGlobalSchemaContext(c.Context(), userID)

	// Use expert prompt from Data Storytelling + Data Scientist skills
	prompt := BuildReportPrompt(schemaStr, tableName, sampleData, columnValues, req.Prompt, req.Language, globalContext)
	content, err := h.callOpenAI(cfg, prompt, userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "AI call failed"})
	}

	// Build a descriptive title from the dataset name or prompt
	title := "AI Generated Report"
	if tableName != "" {
		title = "Report: " + tableName
	}
	if req.Prompt != "" {
		// Truncate prompt to 60 chars for title
		p := req.Prompt
		if len(p) > 60 {
			p = p[:60] + "…"
		}
		title = p
	}

	// ── CRITICAL FIX: save to database so the list page shows the report ──
	report := models.Report{
		ID:        uuid.New().String(),
		UserID:    userID,
		Title:     title,
		Content:   content,
		CreatedAt: time.Now(),
	}
	if req.DatasetID != "" {
		report.DatasetID = &req.DatasetID
	}
	if err := h.db.Create(&report).Error; err != nil {
		// Log but don't break the response — client can still see the content
		// The list will be empty though, so this is a recoverable non-fatal error.
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save report"})
	}
	// ────────────────────────────────────────────────────────────────────────

	return c.Status(fiber.StatusCreated).JSON(report)
}

// extractDatasetContext fetches the dataset table name, a formatted schema string,
// a sample of up to 5 real rows, and distinct values for categorical/string columns.
func (h *AIHandler) extractDatasetContext(datasetID string) (tableName, schemaStr, sampleData, columnValues string, ok bool) {
	if datasetID == "" {
		return "", "", "", "", false
	}

	var ds struct {
		DataTableName string
		Columns       json.RawMessage
		StorageKey    string
		UserID        string
	}
	if err := h.db.Table("datasets").Select("data_table_name, columns, storage_key, user_id").
		Where("id = ?", datasetID).Scan(&ds).Error; err != nil || ds.DataTableName == "" {
		return "", "", "", "", false
	}

	// 1. Format schema as readable column list & identify categorical candidates
	var cols []map[string]interface{}
	var stringCols []string
	if json.Unmarshal(ds.Columns, &cols) == nil {
		var sb strings.Builder
		for _, col := range cols {
			name, _ := col["name"].(string)
			dtype, _ := col["type"].(string)
			if name != "" {
				sb.WriteString(fmt.Sprintf("  - %s (%s)\n", name, dtype))
				// If it's a string/text type, it's a candidate for distinct values
				if dtype == "string" || dtype == "TEXT" || dtype == "VARCHAR" {
					stringCols = append(stringCols, name)
				}
			}
		}
		schemaStr = sb.String()
	} else {
		schemaStr = string(ds.Columns) // fallback raw JSON
	}

	// 2. Fetch real sample rows (max 5)
	fullTableName := strings.TrimSpace(ds.DataTableName)
	if strings.HasPrefix(strings.ToUpper(fullTableName), "(SELECT") {
		// virtual view skip
	} else if strings.Contains(fullTableName, ".") {
		parts := strings.SplitN(fullTableName, ".", 2)
		fullTableName = fmt.Sprintf(`"%s"."%s"`, parts[0], parts[1])
	} else {
		fullTableName = fmt.Sprintf(`"%s"`, fullTableName)
	}

	var samples []map[string]interface{}
	sampleQuery := fmt.Sprintf("SELECT * FROM %s LIMIT 5", fullTableName)

	// 3. Fetch Distinct Values for string columns
	var cvSb strings.Builder
	isExternal := strings.HasPrefix(ds.StorageKey, "EXTERNAL_CONN::")

	if isExternal {
		connID := strings.TrimPrefix(ds.StorageKey, "EXTERNAL_CONN::")
		var conn models.DBConnection
		if err := h.db.Where("id = ? AND user_id = ?", connID, ds.UserID).First(&conn).Error; err == nil {
			opts := connectors.FromDBConnection(&conn, conn.PasswordEncrypted)
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()

			dbConn, err := connectors.Open(opts)
			if err == nil {
				defer dbConn.Close()
				// Samples
				res, _ := dbConn.Query(ctx, sampleQuery, 5)
				if res != nil {
					samples = res.Rows
				}
			}
		}
	} else {
		// Internal Samples
		h.db.Raw(sampleQuery).Find(&samples)
	}

	columnValues = cvSb.String()
	if columnValues == "" {
		columnValues = "(No categorical data found)"
	}

	if len(samples) > 0 {
		if b, err := json.MarshalIndent(samples, "", "  "); err == nil {
			sampleData = string(b)
		}
	} else {
		sampleData = "(Sample data unavailable)"
	}

	tableNameToReturn := ds.DataTableName
	if strings.HasPrefix(strings.ToUpper(strings.TrimSpace(ds.DataTableName)), "(SELECT") {
		parts := strings.Split(ds.DataTableName, " AS ")
		if len(parts) >= 2 {
			tableNameToReturn = strings.TrimSpace(parts[len(parts)-1])
		}
	}

	return tableNameToReturn, schemaStr, sampleData, columnValues, true
}

// executeSQL executes the generated SQL either locally or via an external connection.
func (h *AIHandler) executeSQL(ctx context.Context, datasetID, sqlQuery string) ([]map[string]interface{}, error) {
	var ds struct {
		Name          string
		DataTableName string
		StorageKey    string
		UserID        string
	}
	if err := h.db.WithContext(ctx).Table("datasets").Select("name, data_table_name, storage_key, user_id").
		Where("id = ?", datasetID).Scan(&ds).Error; err != nil {
		return nil, fmt.Errorf("dataset not found: %w", err)
	}

	// S++ SQL Rewriting Engine:
	// Pastikan kueri AI yang mungkin merujuk ke nama logis ("belajar_data")
	// dipetakan kembali ke tabel fisik ("ds_xxx") sebelum eksekusi.
	sqlQuery = RewriteQueryToPhysicalTable(sqlQuery, ds.Name, ds.DataTableName)

	if strings.HasPrefix(strings.ToUpper(strings.TrimSpace(ds.DataTableName)), "(SELECT") {
		parts := strings.Split(ds.DataTableName, " AS ")
		if len(parts) >= 2 {
			virtualAlias := strings.TrimSpace(parts[len(parts)-1])
			sqlQuery = strings.ReplaceAll(sqlQuery, virtualAlias, ds.DataTableName)
		}
	}

	if strings.HasPrefix(ds.StorageKey, "EXTERNAL_CONN::") {
		connID := strings.TrimPrefix(ds.StorageKey, "EXTERNAL_CONN::")
		var conn models.DBConnection
		if err := h.db.Where("id = ? AND user_id = ?", connID, ds.UserID).First(&conn).Error; err != nil {
			return nil, fmt.Errorf("external connection not found: %w", err)
		}

		opts := connectors.FromDBConnection(&conn, conn.PasswordEncrypted)
		ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
		defer cancel()

		dbConn, err := connectors.Open(opts)
		if err != nil {
			return nil, fmt.Errorf("failed to open external connection: %w", err)
		}
		defer dbConn.Close()

		res, err := dbConn.Query(ctx, sqlQuery, 500) // cap AI query limit to 500 rows for safety
		if err != nil {
			return nil, err
		}
		return res.Rows, nil
	}

	var results []map[string]interface{}
	if err := h.db.WithContext(ctx).Raw(sqlQuery).Find(&results).Error; err != nil {
		return nil, err
	}
	return results, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// StreamGenerateReport — SSE streaming report generation
// POST /api/v1/reports/stream
//
// SECURITY: The AI API key is decrypted server-side from the DB.
// Browser DevTools will only see requests to your own domain.
// ─────────────────────────────────────────────────────────────────────────────
func (h *AIHandler) StreamGenerateReport(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var req struct {
		DatasetID string `json:"datasetId"`
		Prompt    string `json:"prompt"`
		Language  string `json:"language"` // "id" | "en" | "ms" | "zh" | "ja" — default "id"
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
	}

	// Resolve and decrypt user's API key — raw key stays on server
	cfg, err := h.resolveUserConfig(userID)
	if err != nil {
		return c.Status(fiber.StatusNotImplemented).JSON(fiber.Map{
			"error":  err.Error(),
			"hint":   "Save your AI API key in Settings → AI Configuration",
			"action": "settings",
		})
	}

	// Extract real schema + sample data → anti-hallucination grounding
	tableName, schemaStr, sampleData, columnValues, _ := h.extractDatasetContext(req.DatasetID)
	globalContext, _ := h.aiSvc.BuildGlobalSchemaContext(c.Context(), userID)

	// Build expert prompt: Data Engineer + Data Scientist + Data Storytelling skills + language
	expertPrompt := BuildReportPrompt(schemaStr, tableName, sampleData, columnValues, req.Prompt, req.Language, globalContext)

	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Set("X-Accel-Buffering", "no")

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		sendSSEEvent(w, "progress", `{"stage":"generating","message":"Analyst AI is analyzing your data and writing report..."}`)
		w.Flush()

		err := h.streamOpenAI(cfg, expertPrompt, userID, func(eventType, token string) {
			if eventType == "message" {
				sendSSEEvent(w, "token", jsonEscape(token))
			} else if eventType == "thought" {
				sendSSEEvent(w, "thought", token)
			}
			w.Flush()
		})
		if err != nil {
			sendSSEEvent(w, "error", jsonEscape(err.Error()))
		} else {
			sendSSEEvent(w, "done", `{"message":"Report generation complete"}`)
		}
		w.Flush()
	})
	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// StreamAskData — SSE streaming NL→SQL→results with phased progress
// POST /api/v1/ask-data/stream
// ─────────────────────────────────────────────────────────────────────────────
func (h *AIHandler) StreamAskData(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var req struct {
		Question  string `json:"question"`
		DatasetID string `json:"datasetId"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
	}
	if req.Question == "" || req.DatasetID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "question and datasetId required"})
	}

	cfg, err := h.resolveUserConfig(userID)
	if err != nil {
		return c.Status(fiber.StatusNotImplemented).JSON(fiber.Map{"error": err.Error()})
	}

	var ds struct {
		Name          string
		DataTableName string
	}
	if err := h.db.Table("datasets").Select("name, data_table_name").
		Where("id = ? AND user_id = ?", req.DatasetID, userID).Scan(&ds).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Dataset not found"})
	}

	tableName, schemaStr, sampleData, columnValues, ok := h.extractDatasetContext(req.DatasetID)
	if !ok {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Dataset not found"})
	}

	globalContext, _ := h.aiSvc.BuildGlobalSchemaContext(c.Context(), userID)

	prompt := BuildAskDataPrompt(tableName, schemaStr, sampleData, columnValues, req.Question, globalContext)

	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Set("X-Accel-Buffering", "no")

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute) // Global SSE timeout
		defer cancel()

		sendSSEEvent(w, "progress", `{"stage":"thinking","message":"Analyzing your question..."}`)
		w.Flush()

		var sqlBuf strings.Builder
		sendSSEEvent(w, "progress", `{"stage":"generating","message":"Generating SQL query..."}`)
		w.Flush()

		err := h.streamOpenAI(cfg, prompt, userID, func(eventType, token string) {
			if eventType == "message" {
				sqlBuf.WriteString(token)
				sendSSEEvent(w, "token", jsonEscape(token))
			} else if eventType == "thought" {
				sendSSEEvent(w, "thought", token)
			}
			w.Flush()
		})
		if err != nil {
			sendSSEEvent(w, "error", jsonEscape("AI call failed: "+err.Error()))
			w.Flush()
			return
		}

		sqlRaw := sqlBuf.String()
		sqlQuery := cleanAISQL(sqlRaw)
		log.Info().Str("dataset_id", req.DatasetID).Str("raw", sqlRaw).Str("cleaned", sqlQuery).Msg("AskData (SSE) Debug")

		// S++: Resolve physical table name BEFORE validation
		sqlQuery = RewriteQueryToPhysicalTable(sqlQuery, ds.Name, ds.DataTableName)

		sqlJSON, _ := json.Marshal(map[string]string{"sql": sqlQuery})
		sendSSEEvent(w, "sql", string(sqlJSON))
		w.Flush()

		if !isSafeSelect(sqlQuery) {
			sendSSEEvent(w, "error", jsonEscape("Non-SELECT query rejected for safety."))
			sendSSEEvent(w, "done", "{}")
			w.Flush()
			return
		}

		sendSSEEvent(w, "progress", `{"stage":"executing","message":"Running query on your data..."}`)
		w.Flush()

		results, dbErr := h.executeSQL(ctx, req.DatasetID, sqlQuery)
		if dbErr != nil {
			errJSON, _ := json.Marshal(map[string]string{"error": dbErr.Error(), "sql": sqlQuery})
			sendSSEEvent(w, "error", string(errJSON))
			sendSSEEvent(w, "done", "{}")
			w.Flush()
			return
		}

		// S++ IMMEDIATE DATA DELIVERY:
		// Send raw results BEFORE starting the (potentially slow) AI interpretation phase.
		// This prevents the 90% hang because the UI gets the data and can render it immediately.
		initialResultJSON, _ := json.Marshal(map[string]interface{}{
			"question": req.Question,
			"sql":      sqlQuery,
			"data":     results,
			"rowCount": len(results),
		})
		sendSSEEvent(w, "result", string(initialResultJSON))
		w.Flush()

		// 2026: Generate Business Interpretation (Optional/Bonus)
		interpretation := ""
		if len(results) > 0 {
			sendSSEEvent(w, "progress", `{"stage":"interpreting","message":"AI is interpreting the data insights..."}`)
			w.Flush()

			resultsSubset := results
			if len(results) > 20 {
				resultsSubset = results[:20]
			}
			subsetJSON, _ := json.Marshal(resultsSubset)

			interpPrompt := BuildAskDataInterpretationPrompt(req.Question, sqlQuery, string(subsetJSON), len(results))

			// We use callOpenAI (non-streaming) for interpretation to get it as a single block
			// S++: Wrapped in a recover/timeout-safe check implicitly via callOpenAI
			interpResult, err := h.callOpenAI(cfg, interpPrompt, userID)
			if err == nil {
				interpretation = interpResult
				// Send updated result with interpretation
				finalResultJSON, _ := json.Marshal(map[string]interface{}{
					"question":       req.Question,
					"sql":            sqlQuery,
					"data":           results,
					"rowCount":       len(results),
					"interpretation": interpretation,
				})
				sendSSEEvent(w, "result", string(finalResultJSON))
			}
		}

		sendSSEEvent(w, "done", "{}")
		w.Flush()
	})
	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool Definitions — NeuraDash 4 Pillars of Autonomous Intelligence
// ─────────────────────────────────────────────────────────────────────────────

func allAITools() []map[string]interface{} {
	return []map[string]interface{}{
		sequentialThinkingToolDef(),
		investigateAnomalyToolDef(),
		executeWorkflowActionToolDef(),
		validateDataIntegrityToolDef(),
	}
}

func sequentialThinkingToolDef() map[string]interface{} {
	return map[string]interface{}{
		"type": "function",
		"function": map[string]interface{}{
			"name":        "sequentialthinking",
			"description": "A detailed tool for dynamic and reflective problem-solving through thoughts. This tool helps analyze problems through a flexible thinking process that can adapt and evolve. Each thought can build on, question, or revise previous insights as understanding deepens.",
			"parameters": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"thought":           map[string]interface{}{"type": "string", "description": "Your current thinking step."},
					"nextThoughtNeeded": map[string]interface{}{"type": "boolean", "description": "Whether another thought step is needed."},
					"thoughtNumber":     map[string]interface{}{"type": "integer", "description": "Current thought number."},
					"totalThoughts":     map[string]interface{}{"type": "integer", "description": "Estimated total thoughts needed.", "default": 10},
				},
				"required": []string{"thought", "nextThoughtNeeded", "thoughtNumber", "totalThoughts"},
			},
		},
	}
}

func investigateAnomalyToolDef() map[string]interface{} {
	return map[string]interface{}{
		"type": "function",
		"function": map[string]interface{}{
			"name":        "investigate_anomaly",
			"description": "Trigger an autonomous investigation into a detected data anomaly (Causal Analysis).",
			"parameters": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"datasetId":          map[string]interface{}{"type": "string", "description": "The unique ID of the dataset containing the anomaly."},
					"anomalyDescription": map[string]interface{}{"type": "string", "description": "Summary of the anomaly detected (e.g., 'Sudden spike in conversion')."},
				},
				"required": []string{"datasetId", "anomalyDescription"},
			},
		},
	}
}

func executeWorkflowActionToolDef() map[string]interface{} {
	return map[string]interface{}{
		"type": "function",
		"function": map[string]interface{}{
			"name":        "execute_workflow_action",
			"description": "Trigger a prescriptive action to an external system (SAP, Odoo, Webhook) via a connected integration.",
			"parameters": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"connectorId": map[string]interface{}{"type": "string", "description": "The ID of the pre-configured system connector."},
					"actionData":  map[string]interface{}{"type": "object", "description": "Data to be sent to the external system."},
				},
				"required": []string{"connectorId", "actionData"},
			},
		},
	}
}

func validateDataIntegrityToolDef() map[string]interface{} {
	return map[string]interface{}{
		"type": "function",
		"function": map[string]interface{}{
			"name":        "validate_data_integrity",
			"description": "Performs a self-healing health check on dataset schema and data quality.",
			"parameters": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"datasetId": map[string]interface{}{"type": "string", "description": "The ID of the dataset to validate."},
				},
				"required": []string{"datasetId"},
			},
		},
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI Call Handlers (Extended for multi-tool support)
// ─────────────────────────────────────────────────────────────────────────────

type aiMessage struct {
	Role      string
	Content   string
	ToolCalls []toolCall
}

type toolCall struct {
	Id       string
	Type     string
	Function struct {
		Name      string
		Arguments string
	}
}

func (h *AIHandler) parseAIResponse(provider string, body io.Reader) (*aiMessage, error) {
	provider = strings.ToLower(provider)
	if provider == "anthropic" {
		var res struct {
			Role    string `json:"role"`
			Content []struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"content"`
			StopReason string `json:"stop_reason"`
		}
		if err := json.NewDecoder(body).Decode(&res); err != nil {
			return nil, err
		}
		msg := &aiMessage{Role: res.Role}
		if len(res.Content) > 0 {
			msg.Content = res.Content[0].Text
		}
		return msg, nil
	}

	// Default OpenAI format
	var result struct {
		Choices []struct {
			Message struct {
				Role      string      `json:"role"`
				Content   interface{} `json:"content"`
				ToolCalls []struct {
					Id       string `json:"id"`
					Type     string `json:"type"`
					Function struct {
						Name      string `json:"name"`
						Arguments string `json:"arguments"`
					} `json:"function"`
				} `json:"tool_calls"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(body).Decode(&result); err != nil {
		return nil, err
	}
	if len(result.Choices) == 0 {
		return nil, fmt.Errorf("AI returned no choices")
	}

	choice := result.Choices[0].Message
	msg := &aiMessage{Role: choice.Role}
	if contentStr, ok := choice.Content.(string); ok {
		msg.Content = contentStr
	}

	for _, tc := range choice.ToolCalls {
		msg.ToolCalls = append(msg.ToolCalls, toolCall{
			Id:   tc.Id,
			Type: tc.Type,
			Function: struct {
				Name      string
				Arguments string
			}{Name: tc.Function.Name, Arguments: tc.Function.Arguments},
		})
	}

	return msg, nil
}

func (h *AIHandler) callOpenAI(cfg resolvedConfig, prompt string, userID string) (string, error) {
	sysMsg, usrMsg := h.splitPrompt(prompt)

	messages := []map[string]interface{}{
		{"role": "system", "content": sysMsg},
		{"role": "user", "content": usrMsg},
	}

	client := &http.Client{Timeout: 90 * time.Second}

	for i := 0; i < 5; i++ { // Limit tool call loops
		url, headers, data, err := h.prepareAIRequest(cfg, messages, false)
		if err != nil {
			return "", err
		}

		httpReq, err := http.NewRequest("POST", url, bytes.NewReader(data))
		if err != nil {
			return "", err
		}
		for k, v := range headers {
			httpReq.Header.Set(k, v)
		}

		// S++ Resiliency: Disable Keep-Alive for custom endpoints (proxies/ngrok) to prevent stall EOF
		if cfg.BaseURL != "" {
			httpReq.Close = true
		}

		resp, err := client.Do(httpReq)
		if err != nil {
			return "", fmt.Errorf("AI request timeout: %w", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			return "", fmt.Errorf("AI API error %d: %s", resp.StatusCode, string(body))
		}

		msg, err := h.parseAIResponse(cfg.Provider, resp.Body)
		if err != nil {
			return "", err
		}

		if len(msg.ToolCalls) == 0 {
			return msg.Content, nil
		}

		// Tool calling logic
		astMsg := map[string]interface{}{
			"role":       "assistant",
			"tool_calls": msg.ToolCalls,
		}
		if msg.Content != "" {
			astMsg["content"] = msg.Content
		}
		messages = append(messages, astMsg)

		for _, tc := range msg.ToolCalls {
			toolResult := h.executeTool(tc.Function.Name, tc.Function.Arguments, userID)
			messages = append(messages, map[string]interface{}{
				"role":         "tool",
				"tool_call_id": tc.Id,
				"name":         tc.Function.Name,
				"content":      toolResult,
			})
		}
	}
	return "", fmt.Errorf("excessive AI tool call recursion")
}

// execution logic for AI tools (Stub/Proxy)
func (h *AIHandler) executeTool(name, args string, userID string) string {
	ctx := context.Background()

	switch name {
	case "sequentialthinking":
		return `{"status": "thought_recorded"}`
	case "investigate_anomaly":
		var params struct {
			DatasetId          string `json:"datasetId"`
			AnomalyDescription string `json:"anomalyDescription"`
		}
		if err := json.Unmarshal([]byte(args), &params); err != nil {
			return `{"error": "invalid arguments"}`
		}
		result, err := h.aiSvc.AnalyzeAnomaly(ctx, params.DatasetId, params.AnomalyDescription)
		if err != nil {
			return fmt.Sprintf(`{"error": "%s"}`, err.Error())
		}
		return fmt.Sprintf(`{"status": "investigation_complete", "result": %s}`, jsonEscape(result))

	case "execute_workflow_action":
		var params struct {
			ConnectorId string                 `json:"connectorId"`
			ActionData  map[string]interface{} `json:"actionData"`
		}
		if err := json.Unmarshal([]byte(args), &params); err != nil {
			return `{"error": "invalid arguments"}`
		}
		result, err := h.aiSvc.ExecutePrescriptiveAction(ctx, params.ConnectorId, params.ActionData)
		if err != nil {
			return fmt.Sprintf(`{"error": "%s"}`, err.Error())
		}
		resJSON, _ := json.Marshal(result)
		return fmt.Sprintf(`{"status": "action_executed", "result": %s}`, string(resJSON))

	case "validate_data_integrity":
		var params struct {
			DatasetId string `json:"datasetId"`
		}
		if err := json.Unmarshal([]byte(args), &params); err != nil {
			return `{"error": "invalid arguments"}`
		}
		result, _, err := h.datasetSvc.CheckSchemaDrift(ctx, params.DatasetId, userID)
		if err != nil {
			return fmt.Sprintf(`{"error": "%s"}`, err.Error())
		}
		return fmt.Sprintf(`{"status": "validation_complete", "result": %s}`, jsonEscape(result))

	default:
		return `{"error": "unknown tool"}`
	}
}

func (h *AIHandler) streamOpenAI(cfg resolvedConfig, prompt string, userID string, onEvent func(eventType string, data string)) error {
	sysMsg, usrMsg := h.splitPrompt(prompt)

	messages := []map[string]interface{}{
		{"role": "system", "content": sysMsg},
		{"role": "user", "content": usrMsg},
	}

	return h.streamOpenAIChatMessages(cfg, messages, userID, onEvent)
}

func (h *AIHandler) splitPrompt(prompt string) (string, string) {
	for _, sep := range []string{"\r\n---\r\n", "\n---\n"} {
		if idx := strings.Index(prompt, sep); idx != -1 {
			return strings.TrimSpace(prompt[:idx]), strings.TrimSpace(prompt[idx+len(sep):])
		}
	}
	return SystemPromptDataAnalyst, prompt
}

// prepareAIRequest handles provider-specific URL, headers, and body transformations.
func (h *AIHandler) prepareAIRequest(cfg resolvedConfig, messages []map[string]interface{}, isStream bool) (string, map[string]string, []byte, error) {
	baseURL := strings.TrimSuffix(cfg.BaseURL, "/")
	if baseURL == "" {
		baseURL = providerBaseURL(cfg.Provider)
	}

	headers := map[string]string{
		"Content-Type":               "application/json",
		"Accept":                     "application/json",
		"User-Agent":                 "NeuraDash/1.0 (Business Intelligence AI Agent)",
		"ngrok-skip-browser-warning": "true",
	}

	maxTokens := cfg.MaxTokens
	if maxTokens <= 0 {
		maxTokens = 4096 // Anthropic & modern models require this. 4k is a safe default for report/sql generation.
	}

	reqBody := map[string]interface{}{
		"model":       cfg.Model,
		"max_tokens":  maxTokens,
		"temperature": cfg.Temperature,
	}

	path := "chat/completions"
	provider := strings.ToLower(cfg.Provider)

	switch provider {
	case "anthropic":
		path = "messages"
		headers["x-api-key"] = cfg.APIKey
		headers["anthropic-version"] = "2023-06-01"

		// Anthropic requires system prompt as a top-level field, not in messages
		system, filteredMsgs := h.transformAnthropicMessages(messages)
		if system != "" {
			reqBody["system"] = system
		}
		reqBody["messages"] = filteredMsgs
	case "cohere":
		path = "chat"
		headers["Authorization"] = "Bearer " + cfg.APIKey
		reqBody["messages"] = messages
	default:
		// OpenAI compatible (Groq, OpenRouter, Mistral, etc)
		headers["Authorization"] = "Bearer " + cfg.APIKey
		reqBody["messages"] = messages
		// Add tools only for OpenAI-compatible if needed, or handle per provider
		reqBody["tools"] = allAITools()
		reqBody["tool_choice"] = "auto"
	}

	if isStream {
		reqBody["stream"] = true
		headers["Accept"] = "text/event-stream"
	}

	finalURL := baseURL + "/" + path
	data, err := json.Marshal(reqBody)
	return finalURL, headers, data, err
}

func (h *AIHandler) transformAnthropicMessages(messages []map[string]interface{}) (string, []map[string]interface{}) {
	var system string
	var filtered []map[string]interface{}
	for _, m := range messages {
		if m["role"] == "system" {
			if content, ok := m["content"].(string); ok {
				system = content
			}
		} else {
			filtered = append(filtered, m)
		}
	}
	return system, filtered
}

func (h *AIHandler) streamOpenAIChatMessages(cfg resolvedConfig, messages []map[string]interface{}, userID string, onEvent func(eventType string, data string)) error {
	client := &http.Client{Timeout: 120 * time.Second}
	provider := strings.ToLower(cfg.Provider)

	for {
		url, headers, data, err := h.prepareAIRequest(cfg, messages, true)
		if err != nil {
			return err
		}

		httpReq, err := http.NewRequest("POST", url, bytes.NewReader(data))
		if err != nil {
			return err
		}
		for k, v := range headers {
			httpReq.Header.Set(k, v)
		}

		// S++ Resiliency: Proxies like ngrok can drop connections; req.Close ensures a fresh socket.
		if cfg.BaseURL != "" {
			httpReq.Close = true
		}

		resp, err := client.Do(httpReq)
		if err != nil {
			log.Error().Err(err).Str("url", url).Msg("AI client.Do failed")
			return err
		}

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			bodyStr := string(body)
			return fmt.Errorf("AI API error %d: %s", resp.StatusCode, bodyStr)
		}

		scanner := bufio.NewScanner(resp.Body)
		var currentContent strings.Builder

		type toolCallAccum struct {
			Id   string
			Name string
			Args strings.Builder
		}
		currentToolCalls := make(map[int]*toolCallAccum)

		for scanner.Scan() {
			line := scanner.Text()

			// --- Anthropic Stream Parsing ---
			if provider == "anthropic" {
				if strings.HasPrefix(line, "data: ") {
					payload := strings.TrimPrefix(line, "data: ")
					var anthroDelta struct {
						Type  string `json:"type"`
						Index int    `json:"index"`
						Delta struct {
							Type string `json:"type"`
							Text string `json:"text"`
						} `json:"delta"`
					}
					if err := json.Unmarshal([]byte(payload), &anthroDelta); err == nil {
						if anthroDelta.Type == "content_block_delta" && anthroDelta.Delta.Text != "" {
							txt := anthroDelta.Delta.Text
							currentContent.WriteString(txt)
							onEvent("message", txt)
						}
					}
				}
				continue
			}

			// --- OpenAI Stream Parsing (Default) ---
			if !strings.HasPrefix(line, "data: ") {
				continue
			}
			payload := strings.TrimPrefix(line, "data: ")
			if payload == "[DONE]" {
				break
			}
			var chunk struct {
				Choices []struct {
					Delta struct {
						Content   *string `json:"content"`
						ToolCalls []struct {
							Index    int     `json:"index"`
							Id       *string `json:"id"`
							Type     *string `json:"type"`
							Function *struct {
								Name      *string `json:"name"`
								Arguments *string `json:"arguments"`
							} `json:"function"`
						} `json:"tool_calls"`
					} `json:"delta"`
				} `json:"choices"`
			}
			if json.Unmarshal([]byte(payload), &chunk) != nil {
				continue
			}
			if len(chunk.Choices) > 0 {
				delta := chunk.Choices[0].Delta
				if delta.Content != nil && *delta.Content != "" {
					currentContent.WriteString(*delta.Content)
					onEvent("message", *delta.Content)
				}

				for _, tc := range delta.ToolCalls {
					if currentToolCalls[tc.Index] == nil {
						currentToolCalls[tc.Index] = &toolCallAccum{}
					}
					if tc.Id != nil {
						currentToolCalls[tc.Index].Id = *tc.Id
					}
					if tc.Function != nil {
						if tc.Function.Name != nil {
							currentToolCalls[tc.Index].Name = *tc.Function.Name
						}
						if tc.Function.Arguments != nil {
							currentToolCalls[tc.Index].Args.WriteString(*tc.Function.Arguments)
						}
					}
				}
			}
		}
		resp.Body.Close()

		if err := scanner.Err(); err != nil {
			return err
		}

		if len(currentToolCalls) == 0 {
			return nil
		}

		astMsg := map[string]interface{}{"role": "assistant"}
		if currentContent.Len() > 0 {
			astMsg["content"] = currentContent.String()
		}

		var indices []int
		for k := range currentToolCalls {
			indices = append(indices, k)
		}
		sort.Ints(indices)

		var tcs []map[string]interface{}
		for _, idx := range indices {
			tc := currentToolCalls[idx]
			tcs = append(tcs, map[string]interface{}{
				"id":   tc.Id,
				"type": "function",
				"function": map[string]interface{}{
					"name":      tc.Name,
					"arguments": tc.Args.String(),
				},
			})
		}
		astMsg["tool_calls"] = tcs
		messages = append(messages, astMsg)

		for _, idx := range indices {
			tc := currentToolCalls[idx]
			if tc.Name == "sequentialthinking" {
				var args map[string]interface{}
				if err := json.Unmarshal([]byte(tc.Args.String()), &args); err == nil {
					thoughtJSON, _ := json.Marshal(args)
					onEvent("thought", string(thoughtJSON))
				}
			}

			toolResult := h.executeTool(tc.Name, tc.Args.String(), userID)

			// Optional: send custom event for pillar-specific tools
			if tc.Name != "sequentialthinking" {
				onEvent("action", fmt.Sprintf(`{"tool": "%s", "result": %s}`, tc.Name, toolResult))
			}

			messages = append(messages, map[string]interface{}{
				"role":         "tool",
				"tool_call_id": tc.Id,
				"name":         tc.Name,
				"content":      toolResult,
			})
		}
	}
}

func providerBaseURL(provider string) string {
	var url string
	switch provider {
	case "openai":
		url = "https://api.openai.com/v1"
	case "openrouter":
		url = "https://openrouter.ai/api/v1"
	case "groq":
		url = "https://api.groq.com/openai/v1"
	case "deepseek":
		url = "https://api.deepseek.com/v1"
	case "together":
		url = "https://api.together.xyz/v1"
	case "mistral":
		url = "https://api.mistral.ai/v1"
	case "nvidia":
		url = "https://integrate.api.nvidia.com/v1"
	case "moonshot":
		url = "https://api.moonshot.cn/v1"
	case "google":
		url = "https://generativelanguage.googleapis.com/v1beta/openai"
	case "anthropic":
		url = "https://api.anthropic.com/v1"
	case "cohere":
		url = "https://api.cohere.com/v2"
	default:
		url = "https://api.openai.com/v1"
	}
	return strings.TrimSuffix(url, "/")
}

func sendSSEEvent(w *bufio.Writer, event, data string) {
	fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, data)
}

// selfHealSQL calls AI to fix a failed SQL query.
func (h *AIHandler) selfHealSQL(cfg resolvedConfig, tableName, schema, question, failedSQL, dbErr, globalCtx, userID string) (string, error) {
	prompt := BuildSQLSelfHealPrompt(tableName, schema, question, failedSQL, dbErr, globalCtx)
	return h.callOpenAI(cfg, prompt, userID)
}

func jsonEscape(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}

func (h *AIHandler) ListAskDataHistory(c *fiber.Ctx) error {
	userID := c.Locals("userId").(string)
	datasetID := c.Query("datasetId")
	var history []models.AskDataHistory
	query := h.db.Where("user_id = ?", userID)
	if datasetID != "" {
		query = query.Where("dataset_id = ?", datasetID)
	}
	if err := query.Order("created_at DESC").Limit(50).Find(&history).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to fetch history"})
	}
	return c.JSON(history)
}

func (h *AIHandler) SaveAskDataHistory(c *fiber.Ctx) error {
	userID := c.Locals("userId").(string)
	var history models.AskDataHistory
	if err := c.BodyParser(&history); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}
	history.ID = uuid.New().String()
	history.UserID = userID
	history.CreatedAt = time.Now()
	if err := h.db.Create(&history).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to save history"})
	}
	return c.JSON(history)
}

func (h *AIHandler) DeleteAskDataHistory(c *fiber.Ctx) error {
	userID := c.Locals("userId").(string)
	id := c.Params("id")
	if err := h.db.Where("id = ? AND user_id = ?", id, userID).Delete(&models.AskDataHistory{}).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to delete history item"})
	}
	return c.SendStatus(204)
}

func cleanAISQL(raw string) string {
	res := strings.TrimSpace(raw)
	reMarkdown := regexp.MustCompile(`(?is)[\s\r\n]*` + "```" + `(?:sql|postgresql|)?\s*(.*?)\s*` + "```")
	matches := reMarkdown.FindStringSubmatch(res)
	if len(matches) > 1 {
		return strings.TrimSpace(matches[1])
	}
	reHeuristic := regexp.MustCompile(`(?is)\b(SELECT|WITH)\b.*`)
	heuristicMatch := reHeuristic.FindString(res)
	if heuristicMatch != "" {
		return strings.TrimSpace(heuristicMatch)
	}
	return res
}

func isSafeSelect(query string) bool {
	clean := query
	reBlock := regexp.MustCompile(`(?is)/\*.*?\*/`)
	clean = reBlock.ReplaceAllString(clean, "")
	reInline := regexp.MustCompile(`(?m)--.*$`)
	clean = reInline.ReplaceAllString(clean, "")
	clean = strings.TrimSpace(clean)
	upperClean := strings.ToUpper(clean)
	return strings.HasPrefix(upperClean, "SELECT") || strings.HasPrefix(upperClean, "WITH")
}

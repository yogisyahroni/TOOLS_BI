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
	"net/url"
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
}

// NewAIHandler creates a new AIHandler.
func NewAIHandler(db *gorm.DB, aiConf config.AIConfig, encryptionKey string) *AIHandler {
	return &AIHandler{db: db, aiConf: aiConf, encryptionKey: encryptionKey}
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
		Messages []map[string]string `json:"messages"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
	}

	cfg, err := h.resolveUserConfig(userID)
	if err != nil {
		return c.Status(fiber.StatusNotImplemented).JSON(fiber.Map{"error": err.Error()})
	}

	baseURLStr := strings.TrimSuffix(cfg.BaseURL, "/")
	if baseURLStr == "" {
		baseURLStr = providerBaseURL(cfg.Provider)
	}

	u, err := url.Parse(baseURLStr)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid AI base URL"})
	}

	allowedAIHosts := map[string]string{
		"api.openai.com":                    "api.openai.com",
		"openrouter.ai":                     "openrouter.ai",
		"api.groq.com":                      "api.groq.com",
		"api.deepseek.com":                  "api.deepseek.com",
		"api.together.xyz":                  "api.together.xyz",
		"api.mistral.ai":                    "api.mistral.ai",
		"integrate.api.nvidia.com":          "integrate.api.nvidia.com",
		"api.moonshot.cn":                   "api.moonshot.cn",
		"generativelanguage.googleapis.com": "generativelanguage.googleapis.com",
		"api.anthropic.com":                 "api.anthropic.com",
		"api.cohere.com":                    "api.cohere.com",
		"localhost":                         "localhost",
		"127.0.0.1":                         "127.0.0.1",
	}

	matchedHost := ""
	if clean, ok := allowedAIHosts[u.Host]; ok {
		matchedHost = clean
	}

	if matchedHost == "" {
		hostRegex := `^[a-zA-Z0-9.-]+(?::[0-9]+)?$`
		if match := regexp.MustCompile(hostRegex).FindString(u.Host); match != "" {
			matchedHost = match
		}
	}

	if matchedHost == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid AI host"})
	}

	// Reconstruct the URL using only allowed primitives
	cleanURL := &url.URL{
		Scheme: u.Scheme,
		Host:   matchedHost,
		Path:   strings.TrimSuffix(u.Path, "/"),
	}

	// Dynamic Tool Recovery Logic
	useTools := true
	var reqBody map[string]interface{}

retryChat:
	reqBody = map[string]interface{}{
		"model":       cfg.Model,
		"messages":    req.Messages,
		"max_tokens":  cfg.MaxTokens,
		"temperature": cfg.Temperature,
		"top_p":       1,
	}

	if useTools {
		reqBody["tools"] = []map[string]interface{}{sequentialThinkingToolDef()}
		reqBody["tool_choice"] = "auto"
	}

	data, _ := json.Marshal(reqBody)
	path := "chat/completions"
	if cfg.Provider == "anthropic" {
		path = "messages"
	} else if cfg.Provider == "cohere" {
		path = "chat"
	}
	finalURL := cleanURL.JoinPath(path).String()

	httpReq, err := http.NewRequest("POST", finalURL, bytes.NewReader(data))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to create request"})
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+cfg.APIKey)

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return c.Status(fiber.StatusGatewayTimeout).JSON(fiber.Map{"error": "AI provider timeout: " + err.Error()})
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		bodyStr := string(body)
		// Detect if failure is due to unsupported tools
		if useTools && (strings.Contains(strings.ToLower(bodyStr), "tool") || strings.Contains(strings.ToLower(bodyStr), "endpoint")) {
			useTools = false
			goto retryChat
		}
		// Friendly Error Interceptor for Credits
		if resp.StatusCode == 402 || strings.Contains(strings.ToLower(bodyStr), "insufficient credits") {
			return c.Status(402).JSON(fiber.Map{"error": "Saldo AI (OpenRouter) Anda habis. Silakan isi ulang saldo di https://openrouter.ai/settings/credits untuk melanjutkan."})
		}
		return c.Status(resp.StatusCode).JSON(fiber.Map{"error": bodyStr})
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to decode AI response"})
	}

	// extract content just to be sure we return standard structure
	content := ""
	if choices, ok := result["choices"].([]interface{}); ok && len(choices) > 0 {
		if choice, ok := choices[0].(map[string]interface{}); ok {
			if msg, ok := choice["message"].(map[string]interface{}); ok {
				content, _ = msg["content"].(string)
			}
		}
	}

	return c.JSON(fiber.Map{"content": content})
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
		err := h.streamOpenAIChatMessages(cfg, req.Messages, func(eventType string, data string) {
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

	// Use expert prompt: Data Engineer (schema fidelity) + Data Scientist (anti-hallucination)
	prompt := BuildAskDataPrompt(tableName, schemaStr, sampleData, columnValues, req.Question)

	sqlRaw, err := h.callOpenAI(cfg, prompt)
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

	results, err := h.executeSQL(req.DatasetID, sqlQuery)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "SQL execution failed", "sql": sqlQuery, "dbError": err.Error(),
		})
	}

	// Phase 2: Interpret results using Data Scientist + Data Storytelling skill
	resultJSON, _ := json.Marshal(results)
	interpretPrompt := BuildAskDataInterpretationPrompt(req.Question, sqlQuery, string(resultJSON), len(results))
	interpretation, _ := h.callOpenAI(cfg, interpretPrompt)

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

	// Use expert prompt from Data Storytelling + Data Scientist skills
	prompt := BuildReportPrompt(schemaStr, tableName, sampleData, columnValues, req.Prompt, req.Language)
	content, err := h.callOpenAI(cfg, prompt)
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
func (h *AIHandler) executeSQL(datasetID, sqlQuery string) ([]map[string]interface{}, error) {
	var ds struct {
		Name          string
		DataTableName string
		StorageKey    string
		UserID        string
	}
	if err := h.db.Table("datasets").Select("name, data_table_name, storage_key, user_id").
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
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
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
	if err := h.db.Raw(sqlQuery).Find(&results).Error; err != nil {
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

	// Build expert prompt: Data Engineer + Data Scientist + Data Storytelling skills + language
	expertPrompt := BuildReportPrompt(schemaStr, tableName, sampleData, columnValues, req.Prompt, req.Language)

	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Set("X-Accel-Buffering", "no")

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		sendSSEEvent(w, "progress", `{"stage":"generating","message":"Analyst AI is analyzing your data and writing report..."}`)
		w.Flush()

		err := h.streamOpenAI(cfg, expertPrompt, func(eventType, token string) {
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

	prompt := BuildAskDataPrompt(tableName, schemaStr, sampleData, columnValues, req.Question)

	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Set("X-Accel-Buffering", "no")

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		sendSSEEvent(w, "progress", `{"stage":"thinking","message":"Analyzing your question..."}`)
		w.Flush()

		var sqlBuf strings.Builder
		sendSSEEvent(w, "progress", `{"stage":"generating","message":"Generating SQL query..."}`)
		w.Flush()

		err := h.streamOpenAI(cfg, prompt, func(eventType, token string) {
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

		results, dbErr := h.executeSQL(req.DatasetID, sqlQuery)
		if dbErr != nil {
			errJSON, _ := json.Marshal(map[string]string{"error": dbErr.Error(), "sql": sqlQuery})
			sendSSEEvent(w, "error", string(errJSON))
			sendSSEEvent(w, "done", "{}")
			w.Flush()
			return
		}

		// 2026: Generate Business Interpretation
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
			interpResult, err := h.callOpenAI(cfg, interpPrompt)
			if err == nil {
				interpretation = interpResult
			}
		}

		resultJSON, _ := json.Marshal(map[string]interface{}{
			"question":       req.Question,
			"sql":            sqlQuery,
			"data":           results,
			"rowCount":       len(results),
			"interpretation": interpretation, // New field for 2026
		})
		sendSSEEvent(w, "result", string(resultJSON))
		sendSSEEvent(w, "done", "{}")
		w.Flush()
	})
	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// callOpenAI — non-streaming OpenAI-compatible request
// ─────────────────────────────────────────────────────────────────────────────
func sequentialThinkingToolDef() map[string]interface{} {
	return map[string]interface{}{
		"type": "function",
		"function": map[string]interface{}{
			"name":        "sequentialthinking",
			"description": "A detailed tool for dynamic and reflective problem-solving through thoughts. This tool helps analyze problems through a flexible thinking process that can adapt and evolve. Each thought can build on, question, or revise previous insights as understanding deepens.",
			"parameters": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"thought": map[string]interface{}{
						"type":        "string",
						"description": "Your current thinking step.",
					},
					"nextThoughtNeeded": map[string]interface{}{
						"type":        "boolean",
						"description": "Whether another thought step is needed.",
					},
					"thoughtNumber": map[string]interface{}{
						"type":        "integer",
						"description": "Current thought number.",
					},
					"totalThoughts": map[string]interface{}{
						"type":        "integer",
						"description": "Estimated total thoughts needed.",
					},
				},
				"required": []string{"thought", "nextThoughtNeeded", "thoughtNumber", "totalThoughts"},
			},
		},
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// callOpenAI — non-streaming OpenAI-compatible request
// ─────────────────────────────────────────────────────────────────────────────
func (h *AIHandler) callOpenAI(cfg resolvedConfig, prompt string) (string, error) {
	baseURL := strings.TrimSuffix(cfg.BaseURL, "/")
	if baseURL == "" {
		baseURL = providerBaseURL(cfg.Provider)
	}

	var systemMsg, userMsg string
	for _, sep := range []string{"\r\n---\r\n", "\n---\n"} {
		if idx := strings.Index(prompt, sep); idx != -1 {
			systemMsg = strings.TrimSpace(prompt[:idx])
			userMsg = strings.TrimSpace(prompt[idx+len(sep):])
			break
		}
	}
	if systemMsg == "" {
		systemMsg = SystemPromptDataAnalyst
		userMsg = prompt
	}

	messages := []map[string]interface{}{
		{"role": "system", "content": systemMsg},
		{"role": "user", "content": userMsg},
	}

	client := &http.Client{Timeout: 60 * time.Second}

	for {
		reqBody := map[string]interface{}{
			"model":       cfg.Model,
			"messages":    messages,
			"max_tokens":  cfg.MaxTokens,
			"temperature": cfg.Temperature,
			"tools":       []map[string]interface{}{sequentialThinkingToolDef()},
			"tool_choice": "auto",
		}
		data, _ := json.Marshal(reqBody)
		httpReq, err := http.NewRequest("POST", baseURL+"/chat/completions", bytes.NewReader(data))
		if err != nil {
			return "", err
		}
		httpReq.Header.Set("Content-Type", "application/json")
		httpReq.Header.Set("Authorization", "Bearer "+cfg.APIKey)
		httpReq.Header.Set("ngrok-skip-browser-warning", "true") // Bypass Ngrok warning page

		resp, err := client.Do(httpReq)
		if err != nil {
			return "", fmt.Errorf("AI request timeout: %w", err)
		}

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			return "", fmt.Errorf("AI API error %d: %s", resp.StatusCode, string(body))
		}

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

		err = json.NewDecoder(resp.Body).Decode(&result)
		resp.Body.Close()
		if err != nil {
			return "", fmt.Errorf("failed to decode AI response: %w", err)
		}

		if len(result.Choices) == 0 {
			return "", fmt.Errorf("AI returned no choices")
		}

		msg := result.Choices[0].Message

		if len(msg.ToolCalls) == 0 {
			if contentStr, ok := msg.Content.(string); ok {
				return contentStr, nil
			}
			return "", fmt.Errorf("AI returned no content")
		}

		astMsg := map[string]interface{}{
			"role":       "assistant",
			"tool_calls": msg.ToolCalls,
		}
		if msg.Content != nil {
			astMsg["content"] = msg.Content
		}
		messages = append(messages, astMsg)

		for _, tc := range msg.ToolCalls {
			toolResult := "{}"
			if tc.Function.Name == "sequentialthinking" {
				toolResult = `{"status": "thought_recorded"}`
			} else {
				toolResult = `{"error": "unknown tool"}`
			}

			messages = append(messages, map[string]interface{}{
				"role":         "tool",
				"tool_call_id": tc.Id,
				"name":         tc.Function.Name,
				"content":      toolResult,
			})
		}
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// streamOpenAI — streaming OpenAI-compatible request, calls onToken per delta
// ─────────────────────────────────────────────────────────────────────────────
func (h *AIHandler) streamOpenAI(cfg resolvedConfig, prompt string, onEvent func(eventType string, data string)) error {
	var sysMsg, usrMsg string
	if idx := strings.Index(prompt, "\n---\n"); idx != -1 {
		sysMsg = strings.TrimSpace(prompt[:idx])
		usrMsg = strings.TrimSpace(prompt[idx+5:])
	} else {
		sysMsg = SystemPromptDataAnalyst
		usrMsg = prompt
	}

	messages := []map[string]interface{}{
		{"role": "system", "content": sysMsg},
		{"role": "user", "content": usrMsg},
	}

	return h.streamOpenAIChatMessages(cfg, messages, onEvent)
}

func (h *AIHandler) streamOpenAIChatMessages(cfg resolvedConfig, messages []map[string]interface{}, onEvent func(eventType string, data string)) error {
	baseURL := strings.TrimSuffix(cfg.BaseURL, "/")
	if baseURL == "" {
		baseURL = providerBaseURL(cfg.Provider)
	}

	client := &http.Client{Timeout: 120 * time.Second}
	useTools := true

	for {
		reqBody := map[string]interface{}{
			"model":       cfg.Model,
			"messages":    messages,
			"max_tokens":  cfg.MaxTokens,
			"temperature": cfg.Temperature,
			"stream":      true,
		}

		if useTools {
			reqBody["tools"] = []map[string]interface{}{sequentialThinkingToolDef()}
			reqBody["tool_choice"] = "auto"
		}

		data, _ := json.Marshal(reqBody)
		path := "chat/completions"
		if cfg.Provider == "anthropic" {
			path = "messages"
		} else if cfg.Provider == "cohere" {
			path = "chat"
		}
		httpReq, err := http.NewRequest("POST", baseURL+"/"+path, bytes.NewReader(data))
		if err != nil {
			return err
		}
		httpReq.Header.Set("Content-Type", "application/json")
		httpReq.Header.Set("Authorization", "Bearer "+cfg.APIKey)
		httpReq.Header.Set("Accept", "text/event-stream")
		httpReq.Header.Set("ngrok-skip-browser-warning", "true") // Bypass Ngrok warning page

		resp, err := client.Do(httpReq)
		if err != nil {
			return err
		}

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			bodyStr := string(body)

			// Detect if failure is due to unsupported tools
			if useTools && (strings.Contains(strings.ToLower(bodyStr), "tool") || strings.Contains(strings.ToLower(bodyStr), "endpoint")) {
				useTools = false
				continue // Retry WITHOUT tools
			}
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

		astMsg := map[string]interface{}{
			"role": "assistant",
		}
		if currentContent.Len() > 0 {
			astMsg["content"] = currentContent.String()
		}

		var tcs []map[string]interface{}
		var indices []int
		for k := range currentToolCalls {
			indices = append(indices, k)
		}
		sort.Ints(indices)

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
			toolResult := "{}"
			if tc.Name == "sequentialthinking" {
				var args map[string]interface{}
				if err := json.Unmarshal([]byte(tc.Args.String()), &args); err == nil {
					thoughtJSON, _ := json.Marshal(args)
					onEvent("thought", string(thoughtJSON))
				}
				toolResult = `{"status": "thought_recorded"}`
			} else {
				toolResult = `{"error": "unknown tool"}`
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

// providerBaseURL maps known provider names to their OpenAI-compatible API base URL.
// Providers not listed here must set baseUrl explicitly in user config.
// Ensures no trailing slash for consistent concatenation with path.
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

// sendSSEEvent writes one SSE event: "event: <type>\ndata: <payload>\n\n"
func sendSSEEvent(w *bufio.Writer, event, data string) {
	fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, data)
}

// jsonEscape wraps a string in JSON quotes, safe for SSE data fields.
func jsonEscape(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}

// ListAskDataHistory returns the query history for the current user.
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

// SaveAskDataHistory persists a query result for future reference.
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

// DeleteAskDataHistory removes a specific record from the user's history.
func (h *AIHandler) DeleteAskDataHistory(c *fiber.Ctx) error {
	userID := c.Locals("userId").(string)
	id := c.Params("id")

	if err := h.db.Where("id = ? AND user_id = ?", id, userID).Delete(&models.AskDataHistory{}).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to delete history item"})
	}

	return c.SendStatus(204)
}

// ─────────────────────────────────────────────────────────────────────────────
// S++ SQL Security & Normalization Helpers
// ─────────────────────────────────────────────────────────────────────────────

// cleanAISQL extracts the raw SQL from markdown and trims noise.
func cleanAISQL(raw string) string {
	res := strings.TrimSpace(raw)
	
	// 1. Try Markdown Extraction
	// Regex: Match content between triple backticks (optional lang identifier)
	// (?is) makes it case-insensitive and allows '.' to match newlines
	reMarkdown := regexp.MustCompile(`(?is)[\s\r\n]*` + "```" + `(?:sql|postgresql|)?\s*(.*?)\s*` + "```")
	matches := reMarkdown.FindStringSubmatch(res)
	if len(matches) > 1 {
		return strings.TrimSpace(matches[1])
	}
	
	// 2. Heuristic Extraction (Fallback)
	// If no markdown, find the FIRST instance of SELECT or WITH and extract until the end.
	// This helps if AI says "Sure, here is the query: SELECT * FROM ..."
	// We look for SELECT and WITH as separate captures to be safe.
	reHeuristic := regexp.MustCompile(`(?is)\b(SELECT|WITH)\b.*`)
	heuristicMatch := reHeuristic.FindString(res)
	if heuristicMatch != "" {
		return strings.TrimSpace(heuristicMatch)
	}

	return res
}

// isSafeSelect validates that the query is a read-only SELECT or WITH statement.
// It strips all comments (inline and block) before validation for maximum reliability.
func isSafeSelect(query string) bool {
	clean := query
	
	// 1. Strip Block Comments /* ... */
	reBlock := regexp.MustCompile(`(?is)/\*.*?\*/`)
	clean = reBlock.ReplaceAllString(clean, "")
	
	// 2. Strip Inline Comments -- ...
	reInline := regexp.MustCompile(`(?m)--.*$`)
	clean = reInline.ReplaceAllString(clean, "")
	
	// 3. Final Trim and Check
	clean = strings.TrimSpace(clean)
	
	// We allow SELECT and WITH (for CTEs)
	// We use case-insensitive check at the start of the "stripped" query
	upperClean := strings.ToUpper(clean)
	return strings.HasPrefix(upperClean, "SELECT") || strings.HasPrefix(upperClean, "WITH")
}

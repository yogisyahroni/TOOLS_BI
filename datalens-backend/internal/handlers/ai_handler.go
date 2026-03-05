package handlers

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"datalens/internal/config"
	"datalens/internal/middleware"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

// AIHandler handles natural language → data query (Ask Data) and report generation.
type AIHandler struct {
	db     *gorm.DB
	aiConf config.AIConfig
}

// NewAIHandler creates a new AIHandler.
func NewAIHandler(db *gorm.DB, aiConf config.AIConfig) *AIHandler {
	return &AIHandler{db: db, aiConf: aiConf}
}

// AskData converts natural language to SQL and executes it (non-streaming).
// POST /api/v1/ask-data
func (h *AIHandler) AskData(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	_ = userID

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
	if h.aiConf.APIKey == "" {
		return c.Status(fiber.StatusNotImplemented).JSON(fiber.Map{
			"error": "AI integration not configured. Set AI_API_KEY in environment.",
		})
	}

	var tableDef struct {
		DataTableName string
		Columns       json.RawMessage
	}
	if err := h.db.Table("datasets").Select("data_table_name, columns").
		Where("id = ?", req.DatasetID).Scan(&tableDef).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Dataset not found"})
	}

	schemaContext := fmt.Sprintf("Table: %s\nColumns: %s", tableDef.DataTableName, string(tableDef.Columns))
	prompt := fmt.Sprintf(`You are a PostgreSQL expert. Given the following table schema, write a SQL SELECT query to answer the user's question.
ONLY output valid SQL, nothing else. Do not include markdown code fences.

Schema:
%s

Question: %s

SQL:`, schemaContext, req.Question)

	sqlQuery, err := h.callAI(prompt)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "AI call failed: " + err.Error()})
	}

	trimmed := strings.TrimSpace(strings.ToUpper(sqlQuery))
	if !strings.HasPrefix(trimmed, "SELECT") {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "AI generated a non-SELECT query. Rejected for safety."})
	}

	var results []map[string]interface{}
	if err := h.db.Raw(sqlQuery).Find(&results).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "SQL execution failed",
			"sql":     sqlQuery,
			"dbError": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"question": req.Question,
		"sql":      sqlQuery,
		"data":     results,
		"rowCount": len(results),
	})
}

// GenerateReport uses AI to generate a text report (non-streaming).
// POST /api/v1/reports/generate
func (h *AIHandler) GenerateReport(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	_ = userID

	var req struct {
		DatasetID string `json:"datasetId"`
		Prompt    string `json:"prompt"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
	}
	if h.aiConf.APIKey == "" {
		return c.Status(fiber.StatusNotImplemented).JSON(fiber.Map{"error": "AI not configured"})
	}

	basePrompt := "Generate a comprehensive data analysis report."
	if req.Prompt != "" {
		basePrompt = req.Prompt
	}

	content, err := h.callAI(basePrompt)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "AI call failed"})
	}
	return c.JSON(fiber.Map{"title": "AI Generated Report", "content": content})
}

// StreamGenerateReport streams an AI report via Server-Sent Events (SSE).
// Tokens arrive progressively — the client sees text being written in real time.
// POST /api/v1/reports/stream
func (h *AIHandler) StreamGenerateReport(c *fiber.Ctx) error {
	var req struct {
		DatasetID string `json:"datasetId"`
		Prompt    string `json:"prompt"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
	}
	if h.aiConf.APIKey == "" {
		return c.Status(fiber.StatusNotImplemented).JSON(fiber.Map{"error": "AI not configured. Set AI_API_KEY."})
	}

	basePrompt := "Generate a comprehensive data analysis report with executive summary, key findings, recommendations, and data story."
	if req.Prompt != "" {
		basePrompt = req.Prompt
	}

	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Set("X-Accel-Buffering", "no")

	return h.streamAI(c, basePrompt)
}

// StreamAskData streams NL→SQL→results via SSE with phase-by-phase progress events.
// POST /api/v1/ask-data/stream
func (h *AIHandler) StreamAskData(c *fiber.Ctx) error {
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
	if h.aiConf.APIKey == "" {
		return c.Status(fiber.StatusNotImplemented).JSON(fiber.Map{"error": "AI not configured"})
	}

	var tableDef struct {
		DataTableName string
		Columns       json.RawMessage
	}
	if err := h.db.Table("datasets").Select("data_table_name, columns").
		Where("id = ?", req.DatasetID).Scan(&tableDef).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Dataset not found"})
	}

	schemaContext := fmt.Sprintf("Table: %s\nColumns: %s", tableDef.DataTableName, string(tableDef.Columns))
	prompt := fmt.Sprintf(`You are a PostgreSQL expert. Given the following table schema, write a SQL SELECT query to answer the user's question.
ONLY output valid SQL, nothing else. Do not include markdown code fences.

Schema:
%s

Question: %s

SQL:`, schemaContext, req.Question)

	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Set("X-Accel-Buffering", "no")

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		// Phase 1: analyzing question
		sendSSEEvent(w, "progress", `{"stage":"thinking","message":"Analyzing your question..."}`)
		w.Flush()

		// Phase 2: AI generates SQL token-by-token
		var sqlBuf strings.Builder
		sendSSEEvent(w, "progress", `{"stage":"generating","message":"Generating SQL query..."}`)
		w.Flush()

		err := h.streamOpenAI(prompt, func(token string) {
			sqlBuf.WriteString(token)
			sendSSEEvent(w, "token", jsonEscape(token))
			w.Flush()
		})
		if err != nil {
			sendSSEEvent(w, "error", jsonEscape("AI call failed: "+err.Error()))
			w.Flush()
			return
		}

		sqlQuery := strings.TrimSpace(sqlBuf.String())
		sqlJSON, _ := json.Marshal(map[string]string{"sql": sqlQuery})
		sendSSEEvent(w, "sql", string(sqlJSON))
		w.Flush()

		if !strings.HasPrefix(strings.ToUpper(sqlQuery), "SELECT") {
			sendSSEEvent(w, "error", jsonEscape("Non-SELECT query rejected for safety."))
			sendSSEEvent(w, "done", "{}")
			w.Flush()
			return
		}

		// Phase 3: execute and return results
		sendSSEEvent(w, "progress", `{"stage":"executing","message":"Running query on your data..."}`)
		w.Flush()

		var results []map[string]interface{}
		if dbErr := h.db.Raw(sqlQuery).Find(&results).Error; dbErr != nil {
			errJSON, _ := json.Marshal(map[string]string{"error": dbErr.Error(), "sql": sqlQuery})
			sendSSEEvent(w, "error", string(errJSON))
			sendSSEEvent(w, "done", "{}")
			w.Flush()
			return
		}

		resultJSON, _ := json.Marshal(map[string]interface{}{
			"question": req.Question,
			"sql":      sqlQuery,
			"data":     results,
			"rowCount": len(results),
		})
		sendSSEEvent(w, "result", string(resultJSON))
		sendSSEEvent(w, "done", "{}")
		w.Flush()
	})

	return nil
}

// callAI returns the full (non-streaming) AI response.
func (h *AIHandler) callAI(prompt string) (string, error) {
	return h.callOpenAI(prompt)
}

// callOpenAI makes a non-streaming OpenAI-compatible chat completion request.
func (h *AIHandler) callOpenAI(prompt string) (string, error) {
	baseURL := h.aiConf.BaseURL
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}

	reqBody := map[string]interface{}{
		"model":      h.aiConf.Model,
		"messages":   []map[string]string{{"role": "user", "content": prompt}},
		"max_tokens": h.aiConf.MaxTokens,
	}
	data, _ := json.Marshal(reqBody)
	httpReq, err := http.NewRequest("POST", baseURL+"/chat/completions", bytes.NewReader(data))
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+h.aiConf.APIKey)

	resp, err := (&http.Client{}).Do(httpReq)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("AI API error %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("failed to decode AI response: %w", err)
	}
	if len(result.Choices) == 0 {
		return "", fmt.Errorf("AI returned no choices")
	}
	return result.Choices[0].Message.Content, nil
}

// streamAI pipes OpenAI streaming tokens to the SSE response.
func (h *AIHandler) streamAI(c *fiber.Ctx, prompt string) error {
	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		sendSSEEvent(w, "progress", `{"stage":"generating","message":"AI is writing your report..."}`)
		w.Flush()

		err := h.streamOpenAI(prompt, func(token string) {
			sendSSEEvent(w, "token", jsonEscape(token))
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

// streamOpenAI calls OpenAI with stream:true and invokes onToken for every content delta.
func (h *AIHandler) streamOpenAI(prompt string, onToken func(string)) error {
	baseURL := h.aiConf.BaseURL
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}

	reqBody := map[string]interface{}{
		"model":      h.aiConf.Model,
		"messages":   []map[string]string{{"role": "user", "content": prompt}},
		"max_tokens": h.aiConf.MaxTokens,
		"stream":     true,
	}
	data, _ := json.Marshal(reqBody)
	httpReq, err := http.NewRequest("POST", baseURL+"/chat/completions", bytes.NewReader(data))
	if err != nil {
		return err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+h.aiConf.APIKey)
	httpReq.Header.Set("Accept", "text/event-stream")

	resp, err := (&http.Client{}).Do(httpReq)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("AI API error %d: %s", resp.StatusCode, string(body))
	}

	// Each line from OpenAI streaming: "data: {...}" or "data: [DONE]"
	scanner := bufio.NewScanner(resp.Body)
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
					Content string `json:"content"`
				} `json:"delta"`
			} `json:"choices"`
		}
		if json.Unmarshal([]byte(payload), &chunk) != nil {
			continue
		}
		if len(chunk.Choices) > 0 && chunk.Choices[0].Delta.Content != "" {
			onToken(chunk.Choices[0].Delta.Content)
		}
	}
	return scanner.Err()
}

// sendSSEEvent writes one SSE event: "event: <type>\ndata: <payload>\n\n"
func sendSSEEvent(w *bufio.Writer, event, data string) {
	fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, data)
}

// jsonEscape wraps a plain string in JSON quotes, safe for SSE data fields.
func jsonEscape(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}

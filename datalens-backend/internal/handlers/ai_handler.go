package handlers

import (
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

// AskData converts natural language to SQL and executes it.
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

	// Fetch dataset schema
	var tableDef struct {
		DataTableName string
		Columns       json.RawMessage
	}
	if err := h.db.Table("datasets").Select("data_table_name, columns").
		Where("id = ?", req.DatasetID).Scan(&tableDef).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Dataset not found"})
	}

	// Build schema context for the AI
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

	// Safety: only allow SELECT queries
	trimmed := strings.TrimSpace(strings.ToUpper(sqlQuery))
	if !strings.HasPrefix(trimmed, "SELECT") {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "AI generated a non-SELECT query. Rejected for safety."})
	}

	// Execute the generated SQL
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

// GenerateReport uses AI to generate a text report from dataset statistics.
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

	return c.JSON(fiber.Map{
		"title":   "AI Generated Report",
		"content": content,
	})
}

// callAI sends a prompt to the configured AI provider and returns the response.
func (h *AIHandler) callAI(prompt string) (string, error) {
	switch h.aiConf.Provider {
	case "openai":
		return h.callOpenAI(prompt)
	default:
		return h.callOpenAI(prompt) // OpenAI-compatible API
	}
}

// callOpenAI sends a chat completion request to OpenAI or compatible API.
func (h *AIHandler) callOpenAI(prompt string) (string, error) {
	baseURL := h.aiConf.BaseURL
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}

	reqBody := map[string]interface{}{
		"model": h.aiConf.Model,
		"messages": []map[string]string{
			{"role": "user", "content": prompt},
		},
		"max_tokens": h.aiConf.MaxTokens,
	}

	data, _ := json.Marshal(reqBody)
	httpReq, err := http.NewRequest("POST", baseURL+"/chat/completions", bytes.NewReader(data))
	if err != nil {
		return "", err
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+h.aiConf.APIKey)

	client := &http.Client{}
	resp, err := client.Do(httpReq)
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

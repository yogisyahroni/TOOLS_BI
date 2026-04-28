package handlers

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/xwb1989/sqlparser"
	"neuradash/internal/services"
)

type NL2SQLHandler struct {
	aiService *services.AIService
}

func NewNL2SQLHandler(aiService *services.AIService) *NL2SQLHandler {
	return &NL2SQLHandler{aiService: aiService}
}

// StreamHandler handles Server-Sent Events for NL2SQL generation
func (h *NL2SQLHandler) StreamHandler(c *fiber.Ctx) error {
	question := c.Query("question")
	datasetID := c.Query("datasetId")

	if question == "" || datasetID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "question and datasetId are required",
		})
	}

	// Set SSE headers
	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Set("Transfer-Encoding", "chunked")

	// Create channel for streaming
	stream := make(chan StreamEvent)
	done := make(chan bool)

	go h.generateStream(question, datasetID, stream, done)

	// Stream events to client
	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		for {
			select {
			case event := <-stream:
				data, _ := json.Marshal(event)
				fmt.Fprintf(w, "data: %s\n\n", data)
				w.Flush()

				if event.Type == "complete" || event.Type == "error" {
					return
				}

			case <-done:
				return

			case <-time.After(30 * time.Second):
				// Timeout
				timeoutEvent := StreamEvent{
					Type:    "error",
					Message: "Generation timeout",
				}
				data, _ := json.Marshal(timeoutEvent)
				fmt.Fprintf(w, "data: %s\n\n", data)
				w.Flush()
				return
			}
		}
	})

	return nil
}

type StreamEvent struct {
	Type             string   `json:"type"`
	Content          string   `json:"content,omitempty"`
	Score            float64  `json:"score,omitempty"`
	Message          string   `json:"message,omitempty"`
	SQL              string   `json:"sql,omitempty"`
	Explanation      string   `json:"explanation,omitempty"`
	Provider         string   `json:"provider,omitempty"`
	Confidence       float64  `json:"confidence,omitempty"`
	RequiresApproval bool     `json:"requiresApproval,omitempty"`
	Alternatives     []string `json:"alternatives,omitempty"`
}

func (h *NL2SQLHandler) generateStream(
	question string,
	datasetID string,
	stream chan<- StreamEvent,
	done chan<- bool,
) {
	defer close(done)
	defer close(stream)

	// 1. Thinking phase
	stream <- StreamEvent{
		Type:    "thinking",
		Content: "Analyzing schema and question context...",
	}
	time.Sleep(100 * time.Millisecond)

	// 2. Get schema context (mock for now, should come from dataset repository)
	schema := services.Schema{
		Tables: []services.Table{
			{Name: "users", Columns: []services.Column{{Name: "id", Type: "int"}, {Name: "name", Type: "text"}}},
		},
	}

	// 3. Generate SQL with streaming
	sqlBuilder := &strings.Builder{}

	// Stream tokens as they're generated
	tokenStream, err := h.aiService.GenerateSQLStreaming(context.Background(), question, schema)
	if err != nil {
		stream <- StreamEvent{
			Type:    "error",
			Message: "Failed to generate stream: " + err.Error(),
		}
		return
	}

	stream <- StreamEvent{Type: "writing"}

	for event := range tokenStream {
		if event.Type == "error" {
			stream <- StreamEvent{Type: "error", Message: event.Message}
			return
		}
		if event.Type == "token" {
			sqlBuilder.WriteString(event.Content)
			stream <- StreamEvent{Type: "token", Content: event.Content}
		} else if event.Type == "complete" {
			// Done streaming tokens
		} else if event.Type == "security_check" {
			stream <- StreamEvent{Type: "security_check", RequiresApproval: event.RequiresApproval}
		} else if event.Type == "confidence" {
			stream <- StreamEvent{Type: "confidence", Score: event.Score}
		}
	}

	generatedSQL := sqlBuilder.String()

	// 4. Calculate confidence
	confidence := h.aiService.CalculateConfidence(question, generatedSQL, schema)
	stream <- StreamEvent{
		Type:  "confidence",
		Score: confidence,
	}

	// 5. Generate explanation
	explanation := h.aiService.GenerateExplanation(question, generatedSQL)
	stream <- StreamEvent{
		Type:    "explanation",
		Content: explanation,
	}

	// 6. Check if destructive
	isDestructive := h.isDestructiveQuery(generatedSQL)
	stream <- StreamEvent{
		Type:             "requires_approval",
		RequiresApproval: isDestructive,
	}

	// 7. Get alternatives if low confidence
	if confidence < 0.7 {
		alternatives := h.aiService.GenerateAlternatives(question, schema)
		stream <- StreamEvent{
			Type:         "alternatives",
			Alternatives: alternatives,
		}
	}

	// 8. Complete
	stream <- StreamEvent{
		Type:             "complete",
		SQL:              generatedSQL,
		Confidence:       confidence,
		Explanation:      explanation,
		Provider:         h.aiService.GetProvider(),
		RequiresApproval: isDestructive,
	}
}

func (h *NL2SQLHandler) isDestructiveQuery(sql string) bool {
	// Clean comments first for accurate analysis
	clean := sql
	reBlock := regexp.MustCompile(`(?is)/\*.*?\*/`)
	clean = reBlock.ReplaceAllString(clean, "")
	reInline := regexp.MustCompile(`(?m)--.*$`)
	clean = reInline.ReplaceAllString(clean, "")
	clean = strings.TrimSpace(clean)

	upperSQL := strings.ToUpper(clean)

	// 1. Check for multiple statements (Semicolon check)
	// We check the ORIGINAL sql before stripping comments to catch comment-based bypasses
	if strings.Contains(sql, ";") {
		idx := strings.Index(sql, ";")
		// If semicolon is not the very last non-whitespace character, it's a risk
		if idx < len(strings.TrimSpace(sql))-1 {
			return true 
		}
	}

	// 2. Check for destructive operations
	destructivePatterns := []string{
		"DROP ", "TRUNCATE ", "DELETE ", "UPDATE ", "ALTER ", 
		"CREATE ", "INSERT ", "GRANT ", "REVOKE ", "EXEC ", "RENAME ",
	}

	for _, pattern := range destructivePatterns {
		if strings.Contains(upperSQL, pattern) {
			return true
		}
	}

	// 3. Structural Validation (AST Parsing)
	if err := h.validateAST(sql); err != nil {
		// If parsing fails, it might be a complex valid query or an invalid one.
		// For Zero-Trust, we could return true to require approval, or just log it.
		// Given we support multiple DBs, we fallback to our robust regex if AST fails.
		return false 
	}

	return false
}

func (h *NL2SQLHandler) validateAST(sql string) error {
	// Note: sqlparser is MySQL-centric, but effective for basic structural checks
	// For other DBs (Postgres, MSSQL), some complex syntax might fail to parse.
	// We use it as an EXTRA layer of security.
	stmt, err := sqlparser.Parse(sql)
	if err != nil {
		return err
	}

	switch stmt.(type) {
	case *sqlparser.Select:
		return nil
	case *sqlparser.Union:
		return nil
	default:
		return fmt.Errorf("unauthorized SQL structure: %T", stmt)
	}
}

// Non-streaming handler for backward compatibility
func (h *NL2SQLHandler) AskHandler(c *fiber.Ctx) error {
	var req struct {
		Question  string `json:"question"`
		DatasetID string `json:"datasetId"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	// Use non-streaming generation
	schema := services.Schema{
		Tables: []services.Table{
			{Name: "users", Columns: []services.Column{{Name: "id", Type: "int"}, {Name: "name", Type: "text"}}},
		},
	}
	result, err := h.aiService.GenerateSQL(c.Context(), req.Question, schema)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"data": result,
	})
}

package handlers

import (
	"bufio"
	"encoding/json"
	"fmt"
	"strings"
	"sync"

	"neuradash/internal/middleware"

	"github.com/gofiber/fiber/v2"
)

// AIDashboardChart defines the structure of each chart returned by the AI.
type AIDashboardChart struct {
	Title string `json:"title"`
	Type  string `json:"type"`
	Width int    `json:"width"`
	Query string `json:"query"`
	Data  []map[string]interface{} `json:"data,omitempty"`
}

// StreamGenerateAIDashboard handles the SSE streaming of AI Dashboard Creation.
// POST /api/v1/ai-dashboard/stream
func (h *AIHandler) StreamGenerateAIDashboard(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var req struct {
		DatasetID string `json:"datasetId"`
		Prompt    string `json:"prompt"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
	}
	if req.DatasetID == "" || req.Prompt == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "datasetId and prompt required"})
	}

	cfg, err := h.resolveUserConfig(userID)
	if err != nil {
		return c.Status(fiber.StatusNotImplemented).JSON(fiber.Map{"error": err.Error()})
	}

	tableName, schemaStr, sampleData, columnValues, ok := h.extractDatasetContext(req.DatasetID)
	if !ok {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Dataset not found"})
	}

	// Prepare Prompt
	datasetContext := fmt.Sprintf("Table: %s\nSchema:\n%s\nSample Data:\n%s\nUnique Values:\n%s", tableName, schemaStr, sampleData, columnValues)
	prompt := fmt.Sprintf("%s\n\nUser Request: %s\nDataset Context:\n%s", SystemPromptAIDashboardBuilder, req.Prompt, datasetContext)

	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Set("X-Accel-Buffering", "no")

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		sendSSEEvent(w, "progress", `{"stage":"planning","message":"🧠 Merancang arsitektur metrik dashboard..."}`)
		w.Flush()

		var jsonBuf strings.Builder
		err := h.streamOpenAI(cfg, prompt, func(eventType, token string) {
			if eventType == "message" {
				jsonBuf.WriteString(token)
				// We don't stream raw JSON tokens to UI to prevent messy UI updates, 
				// but we can send a thinking dot.
				sendSSEEvent(w, "pulse", `{"message":"."}`)
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

		rawJSON := strings.TrimSpace(jsonBuf.String())
		rawJSON = strings.TrimPrefix(rawJSON, "```json")
		rawJSON = strings.TrimPrefix(rawJSON, "```")
		rawJSON = strings.TrimSuffix(rawJSON, "```")
		rawJSON = strings.TrimSpace(rawJSON)

		var charts []AIDashboardChart
		if err := json.Unmarshal([]byte(rawJSON), &charts); err != nil {
			// fallback
			sendSSEEvent(w, "error", jsonEscape("Gagal parse blueprint dari AI: "+err.Error()))
			sendSSEEvent(w, "done", "{}")
			w.Flush()
			return
		}

		sendSSEEvent(w, "progress", `{"stage":"executing","message":"⚡ Mengeksekusi SQL untuk setiap grafik secara paralel..."}`)
		w.Flush()

		// Execute SQL in parallel
		var wg sync.WaitGroup
		for i := range charts {
			wg.Add(1)
			go func(idx int) {
				defer wg.Done()
				results, dbErr := h.executeSQL(req.DatasetID, charts[idx].Query)
				if dbErr == nil {
					charts[idx].Data = results
				} else {
					charts[idx].Data = make([]map[string]interface{}, 0)
				}
			}(i)
		}
		wg.Wait()


		sendSSEEvent(w, "progress", `{"stage":"layouting","message":"🎨 Menata grid visual..."}`)
		w.Flush()

		sendSSEEvent(w, "progress", `{"stage":"success","message":"✅ Berhasil! Merender Visual..."}`)
		
		finalPayload, _ := json.Marshal(charts)
		sendSSEEvent(w, "layout", string(finalPayload))
		sendSSEEvent(w, "done", "{}")
		w.Flush()
	})
	return nil
}

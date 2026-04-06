package handlers

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"neuradash/internal/middleware"

	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog/log"
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

		// S++ Streaming & Pulse Engine:
		// 1. Result Channel to avoid blocking
		// 2. Pulse generator to avoid proxy timeouts
		type result struct {
			idx  int
			data []map[string]interface{}
			err  error
		}
		resChan := make(chan result, len(charts))
		
		// Heartbeat: Send pulse every 5 seconds while executing
		stopPulse := make(chan bool)
		go func() {
			ticker := time.NewTicker(5 * time.Second)
			defer ticker.Stop()
			for {
				select {
				case <-ticker.C:
					sendSSEEvent(w, "pulse", `{"message":"executing..."}`)
					w.Flush()
				case <-stopPulse:
					return
				}
			}
		}()

		// Execute SQL in parallel
		for i := range charts {
			go func(idx int) {
				ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
				defer cancel()

				results, dbErr := h.executeSQL(ctx, req.DatasetID, charts[idx].Query)
				resChan <- result{idx: idx, data: results, err: dbErr}
			}(i)
		}

		// Collect results and update UI in real-time
		for i := 0; i < len(charts); i++ {
			res := <-resChan
			if res.err == nil {
				charts[res.idx].Data = res.data
			} else {
				log.Error().Err(res.err).Str("query", charts[res.idx].Query).Msg("Chart SQL Execution Failed or Timed Out")
				charts[res.idx].Data = make([]map[string]interface{}, 0)
			}
			
			// Optional: Send incremental progress
			progressMsg := fmt.Sprintf(`{"stage":"executing","message":"⚡ Berhasil memproses %d dari %d grafik..."}`, i+1, len(charts))
			sendSSEEvent(w, "progress", progressMsg)
			w.Flush()
		}
		close(stopPulse) // Stop heartbeats


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

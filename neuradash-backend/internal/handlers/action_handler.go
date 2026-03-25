package handlers

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"time"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

// ActionHandler handles executing custom actions (webhooks) safely from the backend.
type ActionHandler struct {
	db     *gorm.DB
	client *http.Client
}

// NewActionHandler creates a new instance.
func NewActionHandler(db *gorm.DB) *ActionHandler {
	return &ActionHandler{
		db: db,
		client: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

// ExecutePayload defines the incoming payload from the frontend to trigger a webhook.
type ExecutePayload struct {
	URL     string            `json:"url"`
	Method  string            `json:"method"`
	Headers map[string]string `json:"headers"`
	Body    string            `json:"body"`
}

// ExecuteAction proxies an HTTP request defined by the dashboard widget.
// This allows the BI dashboard to hit external APIs without CORS issues.
func (h *ActionHandler) ExecuteAction(c *fiber.Ctx) error {
	// Parse input
	var payload ExecutePayload
	if err := c.BodyParser(&payload); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	if payload.URL == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "URL is required"})
	}
	if payload.Method == "" {
		payload.Method = http.MethodPost // Default to POST
	}

	// Prepare request body
	var reqBody io.Reader
	if payload.Body != "" && payload.Method != http.MethodGet {
		reqBody = bytes.NewBufferString(payload.Body)
	}

	// Create request
	req, err := http.NewRequest(payload.Method, payload.URL, reqBody)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create request"})
	}

	// Add default headers if none specified, but always override internally created ones if provided
	req.Header.Set("Content-Type", "application/json")
	for k, v := range payload.Headers {
		req.Header.Set(k, v)
	}

	// Execute request
	resp, err := h.client.Do(req)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "Failed to proxy request: " + err.Error()})
	}
	defer resp.Body.Close()

	// Read response body
	respBodyBytes, _ := io.ReadAll(resp.Body)
	respBody := string(respBodyBytes)

	// Try to return as JSON if possible, else as string
	var jsonBody interface{}
	if err := json.Unmarshal(respBodyBytes, &jsonBody); err == nil {
		return c.Status(resp.StatusCode).JSON(fiber.Map{
			"status":  resp.StatusCode,
			"headers": resp.Header,
			"data":    jsonBody,
		})
	}

	return c.Status(resp.StatusCode).JSON(fiber.Map{
		"status":  resp.StatusCode,
		"headers": resp.Header,
		"data":    respBody,
	})
}

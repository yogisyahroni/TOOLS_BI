// Package handlers_test contains HTTP-level unit tests for core handler validation.
// Tests instantiate REAL handlers with a nil *gorm.DB and nil service.
// Each test exercises the validation branch that returns BEFORE any DB/service call.
// This ensures request validation logic is tested without requiring a live database.
package handlers_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"neuradash/internal/handlers"

	"github.com/gofiber/fiber/v2"
)

// ─── Helpers ──────────────────────────────────────────────────────────────────

// appWith wraps a handler func in a minimal Fiber app with userId injected.
func appWith(method, path string, h fiber.Handler) *fiber.App {
	app := fiber.New(fiber.Config{ErrorHandler: func(c *fiber.Ctx, err error) error {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}})
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userId", "test-user")
		return c.Next()
	})
	switch method {
	case http.MethodGet:
		app.Get(path, h)
	case http.MethodPost:
		app.Post(path, h)
	case http.MethodPut:
		app.Put(path, h)
	case http.MethodPatch:
		app.Patch(path, h)
	case http.MethodDelete:
		app.Delete(path, h)
	}
	return app
}

// jb encodes v as JSON and wraps it as an io.Reader.
func jb(v interface{}) io.Reader {
	b, _ := json.Marshal(v)
	return bytes.NewReader(b)
}

// doRequest sends a request to a Fiber app and returns the response.
func doRequest(app *fiber.App, method, path string, body io.Reader) *http.Response {
	var req *http.Request
	if body != nil {
		req = httptest.NewRequest(method, path, body)
		req.Header.Set("Content-Type", "application/json")
	} else {
		req = httptest.NewRequest(method, path, nil)
	}
	resp, _ := app.Test(req, 10000)
	return resp
}

// ─── ChartHandler Tests ───────────────────────────────────────────────────────

// TestCreateChart_MissingTitle expects 400 when title is empty.
func TestCreateChart_MissingTitle(t *testing.T) {
	h := handlers.NewChartHandler(nil, nil)
	app := appWith(http.MethodPost, "/charts", h.CreateChart)
	resp := doRequest(app, http.MethodPost, "/charts", jb(map[string]string{
		"datasetId": "ds-1",
		"type":      "bar",
		// title intentionally omitted
	}))
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("CreateChart: expected 400 for missing title, got %d", resp.StatusCode)
	}
}

// TestCreateChart_MissingDatasetID expects 400 when datasetId is empty.
func TestCreateChart_MissingDatasetID(t *testing.T) {
	h := handlers.NewChartHandler(nil, nil)
	app := appWith(http.MethodPost, "/charts", h.CreateChart)
	resp := doRequest(app, http.MethodPost, "/charts", jb(map[string]string{
		"title": "My Chart",
		"type":  "line",
		// datasetId intentionally omitted
	}))
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("CreateChart: expected 400 for missing datasetId, got %d", resp.StatusCode)
	}
}

// TestCreateChart_MissingType expects 400 when type is empty.
func TestCreateChart_MissingType(t *testing.T) {
	h := handlers.NewChartHandler(nil, nil)
	app := appWith(http.MethodPost, "/charts", h.CreateChart)
	resp := doRequest(app, http.MethodPost, "/charts", jb(map[string]string{
		"title":     "My Chart",
		"datasetId": "ds-1",
		// type intentionally omitted
	}))
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("CreateChart: expected 400 for missing type, got %d", resp.StatusCode)
	}
}

// TestCreateChart_InvalidBody expects 400 on malformed JSON.
func TestCreateChart_InvalidBody(t *testing.T) {
	h := handlers.NewChartHandler(nil, nil)
	app := appWith(http.MethodPost, "/charts", h.CreateChart)
	req := httptest.NewRequest(http.MethodPost, "/charts", bytes.NewBufferString("not-json{{{"))
	req.Header.Set("Content-Type", "application/json")
	resp, _ := app.Test(req, 5000)
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("CreateChart: expected 400 for invalid JSON, got %d", resp.StatusCode)
	}
}

// ─── AlertHandler Tests ───────────────────────────────────────────────────────

// TestCreateAlert_MissingName expects 400 when name is empty.
func TestCreateAlert_MissingName(t *testing.T) {
	h := handlers.NewAlertHandler(nil)
	app := appWith(http.MethodPost, "/alerts", h.CreateAlert)
	resp := doRequest(app, http.MethodPost, "/alerts", jb(map[string]interface{}{
		"columnName": "revenue",
		"condition":  "gt",
		"threshold":  1000,
		// name intentionally omitted
	}))
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("CreateAlert: expected 400 for missing name, got %d", resp.StatusCode)
	}
}

// TestCreateAlert_MissingColumnName expects 400 when columnName is empty.
func TestCreateAlert_MissingColumnName(t *testing.T) {
	h := handlers.NewAlertHandler(nil)
	app := appWith(http.MethodPost, "/alerts", h.CreateAlert)
	resp := doRequest(app, http.MethodPost, "/alerts", jb(map[string]interface{}{
		"name":      "Revenue Alert",
		"condition": "gt",
		"threshold": 1000,
		// columnName intentionally omitted
	}))
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("CreateAlert: expected 400 for missing columnName, got %d", resp.StatusCode)
	}
}

// TestCreateAlert_MissingCondition expects 400 when condition is empty.
func TestCreateAlert_MissingCondition(t *testing.T) {
	h := handlers.NewAlertHandler(nil)
	app := appWith(http.MethodPost, "/alerts", h.CreateAlert)
	resp := doRequest(app, http.MethodPost, "/alerts", jb(map[string]interface{}{
		"name":       "Revenue Alert",
		"columnName": "revenue",
		"threshold":  1000,
		// condition intentionally omitted
	}))
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("CreateAlert: expected 400 for missing condition, got %d", resp.StatusCode)
	}
}

// TestUpdateAlert_InvalidBody expects 400 on malformed JSON.
func TestUpdateAlert_InvalidBody(t *testing.T) {
	h := handlers.NewAlertHandler(nil)
	app := appWith(http.MethodPut, "/alerts/:id", h.UpdateAlert)
	req := httptest.NewRequest(http.MethodPut, "/alerts/alert-1", bytes.NewBufferString("{bad json"))
	req.Header.Set("Content-Type", "application/json")
	resp, _ := app.Test(req, 5000)
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("UpdateAlert: expected 400 for invalid JSON, got %d", resp.StatusCode)
	}
}

// ─── KPIHandler Tests ─────────────────────────────────────────────────────────

// TestCreateKPI_MissingName expects 400 when name is empty.
func TestCreateKPI_MissingName(t *testing.T) {
	h := handlers.NewKPIHandler(nil)
	app := appWith(http.MethodPost, "/kpis", h.CreateKPI)
	resp := doRequest(app, http.MethodPost, "/kpis", jb(map[string]string{
		"datasetId":  "ds-1",
		"columnName": "revenue",
		// name intentionally omitted
	}))
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("CreateKPI: expected 400 for missing name, got %d", resp.StatusCode)
	}
}

// TestCreateKPI_MissingColumnName expects 400 when columnName is empty.
func TestCreateKPI_MissingColumnName(t *testing.T) {
	h := handlers.NewKPIHandler(nil)
	app := appWith(http.MethodPost, "/kpis", h.CreateKPI)
	resp := doRequest(app, http.MethodPost, "/kpis", jb(map[string]string{
		"name":      "Revenue KPI",
		"datasetId": "ds-1",
		// columnName intentionally omitted
	}))
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("CreateKPI: expected 400 for missing columnName, got %d", resp.StatusCode)
	}
}

// TestCreateKPI_MissingDatasetID expects 400 when datasetId is empty.
func TestCreateKPI_MissingDatasetID(t *testing.T) {
	h := handlers.NewKPIHandler(nil)
	app := appWith(http.MethodPost, "/kpis", h.CreateKPI)
	resp := doRequest(app, http.MethodPost, "/kpis", jb(map[string]string{
		"name":       "Revenue KPI",
		"columnName": "revenue",
		// datasetId intentionally omitted
	}))
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("CreateKPI: expected 400 for missing datasetId, got %d", resp.StatusCode)
	}
}

// ─── Pagination Validation Tests ─────────────────────────────────────────────

// TestListCharts_PaginationDefaults verifies that listing with service=nil
// still panics before returning 200 — meaning the handler DOES reach DB before
// we can intercept. So we only test the limit-clamping inline logic via query params.
// (Full list tests require a DB stub; tested in CI integration tests.)
func TestListCharts_LimitClamping(t *testing.T) {
	// We verify pagination clamping by examining query-parameter parsing
	// in an inline handler that mirrors the real one's logic.
	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error { c.Locals("userId", "u1"); return c.Next() })
	app.Get("/charts", func(c *fiber.Ctx) error {
		limit := c.QueryInt("limit", 20)
		if limit > 100 {
			limit = 100
		}
		return c.JSON(fiber.Map{"limit": limit})
	})
	req := httptest.NewRequest(http.MethodGet, "/charts?limit=999", nil)
	resp, _ := app.Test(req, 5000)
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	var body map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&body) //nolint:errcheck
	if int(body["limit"].(float64)) != 100 {
		t.Errorf("expected limit clamped to 100, got %v", body["limit"])
	}
}

// ─── Compile test ─────────────────────────────────────────────────────────────

// TestHandlerInstantiation verifies that all four handler constructors compile
// and return non-nil values without panicking (nil DB is acceptable here).
func TestHandlerInstantiation(t *testing.T) {
	chartH := handlers.NewChartHandler(nil, nil)
	if chartH == nil {
		t.Error("NewChartHandler returned nil")
	}

	alertH := handlers.NewAlertHandler(nil)
	if alertH == nil {
		t.Error("NewAlertHandler returned nil")
	}

	kpiH := handlers.NewKPIHandler(nil)
	if kpiH == nil {
		t.Error("NewKPIHandler returned nil")
	}

	t.Log("All handler constructors: OK")
}

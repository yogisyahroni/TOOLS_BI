package handlers_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"datalens/internal/handlers"
	"github.com/gofiber/fiber/v2"
)

// BenchmarkStandardRequest measures the overhead of a typical Fiber request lifecycle
// including routing and minimal JSON response.
func BenchmarkStandardRequest(b *testing.B) {
	app := fiber.New()
	app.Get("/ping", func(c *fiber.Ctx) error {
		return c.Status(200).JSON(fiber.Map{"status": "ok"})
	})

	req := httptest.NewRequest(http.MethodGet, "/ping", nil)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		resp, _ := app.Test(req, -1) // -1 disables timeout
		_ = resp.Body.Close()
	}
}

// BenchmarkAuthMiddleware measures the overhead of the authentication local injection.
func BenchmarkAuthMiddleware(b *testing.B) {
	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userId", "test-user-id")
		return c.Next()
	})
	app.Get("/auth-test", func(c *fiber.Ctx) error {
		return c.SendString("ok")
	})

	req := httptest.NewRequest(http.MethodGet, "/auth-test", nil)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		resp, _ := app.Test(req, -1)
		_ = resp.Body.Close()
	}
}

// BenchmarkValidationLatency measures the throughput of a handler with schema validation.
func BenchmarkValidationLatency(b *testing.B) {
	h := handlers.NewChartHandler(nil, nil)
	app := fiber.New()
	app.Post("/charts", h.CreateChart)

	payload := []byte(`{"title":"Benchmark Chart","datasetId":"ds-123","type":"bar"}`)
	
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		req := httptest.NewRequest(http.MethodPost, "/charts", bytes.NewReader(payload))
		req.Header.Set("Content-Type", "application/json")
		resp, _ := app.Test(req, -1)
		_ = resp.Body.Close()
	}
}

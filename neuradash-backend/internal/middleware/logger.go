package middleware

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
)

// Logger returns a Fiber middleware that logs requests with zerolog.
func Logger() fiber.Handler {
	return func(c *fiber.Ctx) error {
		start := time.Now()

		// Generate request ID for tracing
		reqID := c.Get("X-Request-ID")
		if reqID == "" {
			reqID = uuid.New().String()
			c.Set("X-Request-ID", reqID)
		}

		err := c.Next()

		duration := time.Since(start)
		status := c.Response().StatusCode()

		event := log.Info()
		if status >= 400 {
			event = log.Warn()
		}
		if status >= 500 {
			event = log.Error()
		}

		event.
			Str("method", c.Method()).
			Str("path", c.Path()).
			Int("status", status).
			Dur("duration", duration).
			Str("ip", c.IP()).
			Str("requestId", reqID).
			Str("userAgent", c.Get("User-Agent")).
			Msg("HTTP request")

		return err
	}
}

// Recover returns a middleware that catches panics and returns 500.
func Recover() fiber.Handler {
	return func(c *fiber.Ctx) error {
		defer func() {
			if r := recover(); r != nil {
				log.Error().Interface("panic", r).
					Str("path", c.Path()).
					Str("method", c.Method()).
					Msg("Recovered from panic")
				_ = c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
					"error": "Internal server error",
				})
			}
		}()
		return c.Next()
	}
}

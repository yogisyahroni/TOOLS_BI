package middleware

import (
	"github.com/gofiber/fiber/v2"
)

// CORS returns a custom CORS middleware that supports non-standard schemes like tauri://.
// This bypasses Fiber's built-in CORS validation which rejects tauri://localhost.
func CORS(origins []string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		origin := c.Get("Origin")
		if origin == "" {
			return c.Next()
		}

		// Check if origin is allowed
		isAllowed := false
		if origin == "tauri://localhost" || origin == "http://localhost:1420" || origin == "http://localhost:5173" {
			isAllowed = true
		} else {
			for _, o := range origins {
				if o == origin {
					isAllowed = true
					break
				}
			}
		}

		if isAllowed {
			c.Set("Access-Control-Allow-Origin", origin)
			c.Set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
			c.Set("Access-Control-Allow-Headers", "Authorization,Content-Type,Accept,X-Request-ID")
			c.Set("Access-Control-Allow-Credentials", "true")
			c.Set("Access-Control-Max-Age", "86400")
		}

		// Handle preflight requests
		if c.Method() == "OPTIONS" {
			return c.SendStatus(fiber.StatusNoContent)
		}

		return c.Next()
	}
}

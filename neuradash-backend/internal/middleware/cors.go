package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
)

// CORS returns a CORS middleware configured for the given origins.
func CORS(origins []string) fiber.Handler {
	allowOrigins := strings.Join(origins, ",")
	if allowOrigins == "" {
		allowOrigins = "*"
	}
	return cors.New(cors.Config{
		AllowOrigins:     allowOrigins,
		AllowMethods:     "GET,POST,PUT,PATCH,DELETE,OPTIONS",
		AllowHeaders:     "Authorization,Content-Type,Accept,X-Request-ID",
		AllowCredentials: true,
		MaxAge:           86400, // 24h preflight cache
	})
}

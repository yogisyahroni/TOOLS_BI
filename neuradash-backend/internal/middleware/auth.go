package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
)

// AuthRequired validates the JWT access token in the Authorization header.
func AuthRequired(secret string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		header := c.Get("Authorization")
		if header == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Missing authorization header",
			})
		}

		tokenStr := strings.TrimPrefix(header, "Bearer ")
		if tokenStr == header {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Invalid authorization format, expected 'Bearer <token>'",
			})
		}

		token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fiber.NewError(fiber.StatusUnauthorized, "unexpected signing method")
			}
			return []byte(secret), nil
		})

		if err != nil || !token.Valid {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Invalid or expired token",
			})
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Invalid token claims",
			})
		}

		userID, _ := claims["sub"].(string)
		role, _ := claims["role"].(string)
		if userID == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Invalid token: missing user ID",
			})
		}

		c.Locals("userId", userID)
		c.Locals("role", role)
		return c.Next()
	}
}

// RequireRole checks that the authenticated user has at least the given role.
func RequireRole(allowedRoles ...string) fiber.Handler {
	allowed := make(map[string]bool, len(allowedRoles))
	for _, r := range allowedRoles {
		allowed[r] = true
	}
	return func(c *fiber.Ctx) error {
		role, _ := c.Locals("role").(string)
		if !allowed[role] {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "Insufficient permissions",
			})
		}
		return c.Next()
	}
}

// GetUserID extracts the authenticated userID from fiber local context.
func GetUserID(c *fiber.Ctx) string {
	id, _ := c.Locals("userId").(string)
	return id
}

// GetRole extracts the authenticated role from fiber local context.
func GetRole(c *fiber.Ctx) string {
	role, _ := c.Locals("role").(string)
	return role
}

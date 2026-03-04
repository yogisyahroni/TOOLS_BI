package handlers

import (
	"datalens/internal/middleware"
	"datalens/internal/realtime"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"
)

// WSHandler handles WebSocket upgrade and client registration.
type WSHandler struct {
	hub *realtime.Hub
}

// NewWSHandler creates a new WSHandler.
func NewWSHandler(hub *realtime.Hub) *WSHandler {
	return &WSHandler{hub: hub}
}

// HandleUpgrade checks if the request is a WebSocket upgrade request.
// This middleware runs before the WebSocket handler.
func (h *WSHandler) HandleUpgrade() fiber.Handler {
	return func(c *fiber.Ctx) error {
		if websocket.IsWebSocketUpgrade(c) {
			return c.Next()
		}
		return fiber.ErrUpgradeRequired
	}
}

// HandleConnection handles the actual WebSocket connection lifecycle.
func (h *WSHandler) HandleConnection() fiber.Handler {
	return websocket.New(func(conn *websocket.Conn) {
		// Get user ID from Fiber locals (set by auth middleware earlier in the chain)
		userID, ok := conn.Locals("userId").(string)
		if !ok || userID == "" {
			conn.Close()
			return
		}

		// Register client in hub and start read/write pumps
		client := h.hub.Register(conn, userID)

		// Send welcome event
		h.hub.SendToUser(userID, realtime.Event{
			Type:    "connected",
			Payload: fiber.Map{"message": "WebSocket connection established", "userId": userID},
		})

		// Blocks until client disconnects
		client.Pump()
	})
}

// WSAuthMiddleware extracts the JWT token from query param for WebSocket connections.
// Used because browsers cannot set Authorization headers in WS connections.
func WSAuthMiddleware(secret string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		token := c.Query("token")
		if token == "" {
			// Fall back to header (for tools like Postman)
			token = middleware.GetUserID(c)
			if token != "" {
				return c.Next()
			}
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "token required"})
		}

		// Reuse the auth middleware logic
		c.Request().Header.Set("Authorization", "Bearer "+token)
		return middleware.AuthRequired(secret)(c)
	}
}

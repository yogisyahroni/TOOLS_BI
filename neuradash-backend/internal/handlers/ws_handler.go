package handlers

import (
	"strings"

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
// Browsers cannot set Authorization headers in WS connections, so token is passed via ?token=.
// BUG-05 fix: fallback correctly reads from Authorization header instead of incorrectly
// calling GetUserID() which would always return "" at this point in the middleware chain.
func WSAuthMiddleware(secret string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Primary: token from query param (browser WebSocket connections)
		token := c.Query("token")

		if token == "" {
			// BUG-05 fix: fallback to Authorization header (for Postman/curl/API tools)
			// Do NOT call GetUserID(c) here — locals are not yet populated.
			authHeader := c.Get("Authorization")
			if strings.HasPrefix(authHeader, "Bearer ") {
				token = strings.TrimPrefix(authHeader, "Bearer ")
			}
		}

		if token == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "token required (use ?token= query param or Authorization header)"})
		}

		// Inject token into Authorization header and run the standard JWT middleware
		c.Request().Header.Set("Authorization", "Bearer "+token)
		return middleware.AuthRequired(secret)(c)
	}
}

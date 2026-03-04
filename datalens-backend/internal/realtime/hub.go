package realtime

import (
	"encoding/json"
	"sync"

	"github.com/gofiber/websocket/v2"
	"github.com/rs/zerolog/log"
)

// Event is a typed WebSocket message.
type Event struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
	UserID  string      `json:"-"` // routing target, not serialized
}

// Hub manages all WebSocket client connections.
type Hub struct {
	// userID → set of connected clients
	clients    map[string]map[*Client]bool
	broadcast  chan Event
	register   chan *Client
	unregister chan *Client
	mu         sync.RWMutex
}

// NewHub creates a new Hub.
func NewHub() *Hub {
	return &Hub{
		clients:    make(map[string]map[*Client]bool),
		broadcast:  make(chan Event, 512),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

// Run starts the hub event loop. Must be called in a goroutine.
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			if _, ok := h.clients[client.UserID]; !ok {
				h.clients[client.UserID] = make(map[*Client]bool)
			}
			h.clients[client.UserID][client] = true
			h.mu.Unlock()
			log.Debug().Str("userId", client.UserID).Msg("WebSocket client registered")

		case client := <-h.unregister:
			h.mu.Lock()
			if clients, ok := h.clients[client.UserID]; ok {
				delete(clients, client)
				if len(clients) == 0 {
					delete(h.clients, client.UserID)
				}
			}
			h.mu.Unlock()
			log.Debug().Str("userId", client.UserID).Msg("WebSocket client unregistered")

		case event := <-h.broadcast:
			h.mu.RLock()
			clients, ok := h.clients[event.UserID]
			if ok {
				for client := range clients {
					select {
					case client.send <- event:
					default:
						// Client send buffer full; drop and unregister
						log.Warn().Str("userId", event.UserID).Msg("WebSocket client send buffer full, disconnecting")
						go func(cl *Client) { h.unregister <- cl }(client)
					}
				}
			}
			h.mu.RUnlock()
		}
	}
}

// SendToUser pushes an event to all connections of a specific user.
func (h *Hub) SendToUser(userID string, event Event) {
	event.UserID = userID
	select {
	case h.broadcast <- event:
	default:
		log.Warn().Str("userId", userID).Str("type", event.Type).Msg("Hub broadcast channel full, dropping event")
	}
}

// Broadcast sends an event to ALL connected clients (admin broadcast).
func (h *Hub) Broadcast(eventType string, payload interface{}) {
	data, _ := json.Marshal(payload)
	h.mu.RLock()
	for userID := range h.clients {
		h.SendToUser(userID, Event{Type: eventType, Payload: json.RawMessage(data)})
	}
	h.mu.RUnlock()
}

// Register adds a client to the hub.
func (h *Hub) Register(conn *websocket.Conn, userID string) *Client {
	client := newClient(conn, userID, h)
	h.register <- client
	return client
}

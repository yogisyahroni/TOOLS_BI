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

type clientMessage struct {
	client *Client
	event  Event
}

type roomBroadcastMessage struct {
	roomID   string
	event    Event
	senderID string // To prevent echoing back to the sender
}

// Hub manages all WebSocket client connections.
type Hub struct {
	// userID → set of connected clients
	clients map[string]map[*Client]bool

	// roomID (e.g. dashboardID) -> set of connected clients
	rooms map[string]map[*Client]bool

	broadcast      chan Event
	roomBroadcast  chan roomBroadcastMessage
	clientMessages chan clientMessage
	register       chan *Client
	unregister     chan *Client
	mu             sync.RWMutex
}

// NewHub creates a new Hub.
func NewHub() *Hub {
	return &Hub{
		clients:        make(map[string]map[*Client]bool),
		rooms:          make(map[string]map[*Client]bool),
		broadcast:      make(chan Event, 512),
		roomBroadcast:  make(chan roomBroadcastMessage, 512),
		clientMessages: make(chan clientMessage, 1024),
		register:       make(chan *Client),
		unregister:     make(chan *Client),
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
			// Remove from clients
			if clients, ok := h.clients[client.UserID]; ok {
				if _, exists := clients[client]; exists {
					close(client.send)
					delete(clients, client)
					if len(clients) == 0 {
						delete(h.clients, client.UserID)
					}
				}
			}
			// Remove from room
			if client.RoomID != "" {
				if rClients, ok := h.rooms[client.RoomID]; ok {
					delete(rClients, client)
					if len(rClients) == 0 {
						delete(h.rooms, client.RoomID)
					}
				}
			}
			h.mu.Unlock()
			log.Debug().Str("userId", client.UserID).Msg("WebSocket client unregistered")

		case msg := <-h.clientMessages:
			// Handle client messages (join_room, leave_room, cursor_move, yjs_update)
			switch msg.event.Type {
			case "join_room":
				payloadMap, ok := msg.event.Payload.(map[string]interface{})
				if ok {
					if roomID, ok := payloadMap["roomId"].(string); ok {
						h.mu.Lock()
						// Leave old room if any
						if msg.client.RoomID != "" {
							if rClients, exists := h.rooms[msg.client.RoomID]; exists {
								delete(rClients, msg.client)
								if len(rClients) == 0 {
									delete(h.rooms, msg.client.RoomID)
								}
							}
						}

						// Join new room
						msg.client.RoomID = roomID
						if _, exists := h.rooms[roomID]; !exists {
							h.rooms[roomID] = make(map[*Client]bool)
						}
						h.rooms[roomID][msg.client] = true
						h.mu.Unlock()

						log.Debug().Str("userId", msg.client.UserID).Str("roomId", roomID).Msg("Client joined room")
					}
				}
			case "leave_room":
				h.mu.Lock()
				if msg.client.RoomID != "" {
					if rClients, exists := h.rooms[msg.client.RoomID]; exists {
						delete(rClients, msg.client)
						if len(rClients) == 0 {
							delete(h.rooms, msg.client.RoomID)
						}
					}
					msg.client.RoomID = ""
				}
				h.mu.Unlock()
			case "cursor_move", "yjs_update", "presence":
				// Broadcast to room
				if msg.client.RoomID != "" {
					h.roomBroadcast <- roomBroadcastMessage{
						roomID:   msg.client.RoomID,
						event:    msg.event,
						senderID: msg.client.UserID,
					}
				}
			}

		case rb := <-h.roomBroadcast:
			h.mu.RLock()
			clients, ok := h.rooms[rb.roomID]
			if ok {
				for client := range clients {
					if client.UserID == rb.senderID {
						continue // Don't echo to sender
					}
					select {
					case client.send <- rb.event:
					default:
						log.Warn().Str("userId", client.UserID).Msg("WebSocket client send buffer full, disconnecting")
						go func(cl *Client) { h.unregister <- cl }(client)
					}
				}
			}
			h.mu.RUnlock()

		case event := <-h.broadcast:
			h.mu.RLock()
			clients, ok := h.clients[event.UserID]
			if ok {
				for client := range clients {
					select {
					case client.send <- event:
					default:
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

// SendToRoom pushes an event to all users in a room from system side
func (h *Hub) SendToRoom(roomID string, event Event) {
	select {
	case h.roomBroadcast <- roomBroadcastMessage{roomID: roomID, event: event, senderID: ""}:
	default:
		log.Warn().Str("roomId", roomID).Str("type", event.Type).Msg("Hub room broadcast channel full, dropping event")
	}
}

// Broadcast sends an event to ALL connected clients (admin use).
func (h *Hub) Broadcast(eventType string, payload interface{}) {
	data, _ := json.Marshal(payload)

	h.mu.RLock()
	userIDs := make([]string, 0, len(h.clients))
	for userID := range h.clients {
		userIDs = append(userIDs, userID)
	}
	h.mu.RUnlock()

	for _, userID := range userIDs {
		h.SendToUser(userID, Event{Type: eventType, Payload: json.RawMessage(data)})
	}
}

// Register adds a client to the hub.
func (h *Hub) Register(conn *websocket.Conn, userID string) *Client {
	client := newClient(conn, userID, h)
	h.register <- client
	return client
}

package realtime

import (
	"encoding/json"
	"time"

	"github.com/gofiber/websocket/v2"
	"github.com/rs/zerolog/log"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = 30 * time.Second
	maxMessageSize = 512 * 1024 // 512 KB
)

// Client is a single WebSocket connection to the hub.
type Client struct {
	UserID string
	conn   *websocket.Conn
	send   chan Event
	hub    *Hub
}

func newClient(conn *websocket.Conn, userID string, hub *Hub) *Client {
	return &Client{
		UserID: userID,
		conn:   conn,
		send:   make(chan Event, 256),
		hub:    hub,
	}
}

// Pump starts both the read and write goroutines for this client.
func (c *Client) Pump() {
	go c.writePump()
	c.readPump() // blocks until disconnect
}

// readPump handles incoming messages and heartbeats.
func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		return c.conn.SetReadDeadline(time.Now().Add(pongWait))
	})

	for {
		_, msg, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err,
				websocket.CloseGoingAway,
				websocket.CloseAbnormalClosure) {
				log.Debug().Err(err).Str("userId", c.UserID).Msg("WebSocket unexpected close")
			}
			break
		}
		// Handle client-sent messages (e.g., subscribe to dataset events)
		var incoming map[string]interface{}
		if err := json.Unmarshal(msg, &incoming); err == nil {
			log.Debug().Str("userId", c.UserID).Interface("msg", incoming).Msg("WS message received")
		}
	}
}

// writePump sends queued events to the client and sends pings.
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case event, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// Hub closed the channel
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			data, err := json.Marshal(event)
			if err != nil {
				log.Error().Err(err).Msg("Failed to marshal WebSocket event")
				continue
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, data); err != nil {
				log.Debug().Err(err).Str("userId", c.UserID).Msg("WS write error")
				return
			}

		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

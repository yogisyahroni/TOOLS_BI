package realtime

import (
	"encoding/json"
	"sync"
	"time"

	"github.com/gofiber/websocket/v2"
	"github.com/rs/zerolog/log"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = 30 * time.Second
	maxMessageSize = 10 * 1024 * 1024 // 10 MB to allow large Yjs initial syncs
)

// Client is a single WebSocket connection to the hub.
type Client struct {
	UserID     string
	RoomID     string
	conn       *websocket.Conn
	send       chan Event
	hub        *Hub
	closeOnce  sync.Once
	isClosed   bool
	clientLock sync.Mutex
}

func newClient(conn *websocket.Conn, userID string, hub *Hub) *Client {
	return &Client{
		UserID: userID,
		RoomID: "",
		conn:   conn,
		send:   make(chan Event, 512),
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
		// Recover from panics inside readPump
		if r := recover(); r != nil {
			log.Error().Interface("panic", r).Str("userId", c.UserID).Msg("Recovered panic in readPump")
		}
		c.hub.unregister <- c
		c.closeConn()
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

		// Parse incoming event
		var incoming Event
		if err := json.Unmarshal(msg, &incoming); err == nil {
			// Enrich payload with sender's userID so clients know who it's from
			if payloadMap, ok := incoming.Payload.(map[string]interface{}); ok {
				payloadMap["userId"] = c.UserID
				incoming.Payload = payloadMap
			}

			// Forward to Hub for routing
			c.hub.clientMessages <- clientMessage{
				client: c,
				event:  incoming,
			}
		} else {
			log.Warn().Err(err).Str("userId", c.UserID).Msg("Failed to unmarshal WS message")
		}
	}
}

// writePump sends queued events to the client and sends pings.
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		if r := recover(); r != nil {
			log.Error().Interface("panic", r).Str("userId", c.UserID).Msg("Recovered panic in writePump")
		}
		ticker.Stop()
		c.closeConn()
	}()

	for {
		select {
		case event, ok := <-c.send:
			c.clientLock.Lock()
			if c.isClosed {
				c.clientLock.Unlock()
				return
			}
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// Hub closed the channel
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				c.clientLock.Unlock()
				return
			}
			data, err := json.Marshal(event)
			if err != nil {
				c.clientLock.Unlock()
				log.Error().Err(err).Msg("Failed to marshal WebSocket event")
				continue
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, data); err != nil {
				c.clientLock.Unlock()
				log.Debug().Err(err).Str("userId", c.UserID).Msg("WS write error")
				return
			}
			c.clientLock.Unlock()

		case <-ticker.C:
			c.clientLock.Lock()
			if c.isClosed {
				c.clientLock.Unlock()
				return
			}
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				c.clientLock.Unlock()
				return
			}
			c.clientLock.Unlock()
		}
	}
}

// closeConn safely closes the websocket connection exactly once
func (c *Client) closeConn() {
	c.closeOnce.Do(func() {
		c.clientLock.Lock()
		c.isClosed = true
		c.clientLock.Unlock()
		c.conn.Close()
	})
}

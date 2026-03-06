package handlers

import (
	"datalens/internal/services"

	"github.com/gofiber/fiber/v2"
)

type ConnectorHandler struct {
	AirbyteService *services.AirbyteService
}

func NewConnectorHandler(as *services.AirbyteService) *ConnectorHandler {
	return &ConnectorHandler{
		AirbyteService: as,
	}
}

// GetCatalog returns available connectors
func (h *ConnectorHandler) GetCatalog(c *fiber.Ctx) error {
	sources, err := h.AirbyteService.GetSourceDefinitions()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.Status(fiber.StatusOK).JSON(sources)
}

// GetActive returns active connections
func (h *ConnectorHandler) GetActive(c *fiber.Ctx) error {
	connections, err := h.AirbyteService.GetActiveConnections()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.Status(fiber.StatusOK).JSON(connections)
}

// SetupConnection creates a new connection
func (h *ConnectorHandler) SetupConnection(c *fiber.Ctx) error {
	var payload struct {
		SourceId    string                 `json:"sourceId"`
		Credentials map[string]interface{} `json:"credentials"`
	}

	if err := c.BodyParser(&payload); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid payload"})
	}

	conn, err := h.AirbyteService.SetupConnection(payload.SourceId, payload.Credentials)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.Status(fiber.StatusOK).JSON(conn)
}

// TriggerSync starts a sync job
func (h *ConnectorHandler) TriggerSync(c *fiber.Ctx) error {
	id := c.Params("id")

	status, err := h.AirbyteService.TriggerSync(id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.Status(fiber.StatusOK).JSON(status)
}

package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"datalens/internal/connectors"
	"datalens/internal/middleware"
	"datalens/internal/models"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// SchemaHandler manages external DB connections and schema introspection.
type SchemaHandler struct {
	db *gorm.DB
}

// NewSchemaHandler creates a new SchemaHandler.
func NewSchemaHandler(db *gorm.DB) *SchemaHandler {
	return &SchemaHandler{db: db}
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/connections/types
// ─────────────────────────────────────────────────────────────────────────────

// GetSupportedTypes returns all supported DB types for the UI dropdown.
func (h *SchemaHandler) GetSupportedTypes(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{"data": connectors.SupportedTypes()})
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/connections
// ─────────────────────────────────────────────────────────────────────────────

// ListConnections returns all DB connections for the user.
func (h *SchemaHandler) ListConnections(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var conns []models.DBConnection
	if err := h.db.Where("user_id = ? AND is_active = true", userID).
		Order("created_at desc").Find(&conns).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch connections"})
	}
	return c.JSON(fiber.Map{"data": conns})
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/connections
// ─────────────────────────────────────────────────────────────────────────────

// CreateConnection stores a new DB connection credential.
func (h *SchemaHandler) CreateConnection(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var req struct {
		Name         string `json:"name"`
		DBType       string `json:"dbType"`
		Host         string `json:"host"`
		Port         int    `json:"port"`
		DatabaseName string `json:"databaseName"`
		Username     string `json:"username"`
		Password     string `json:"password"`
		SSLMode      string `json:"sslMode"`
		SchemaName   string `json:"schemaName"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if req.Name == "" || req.DBType == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name and dbType are required"})
	}

	if req.DBType == "webhook" {
		req.Host = "n/a"
		req.DatabaseName = "n/a"
		req.Username = "webhook"
		req.Password = uuid.New().String()
	}

	// Look up default port for this DB type
	if req.Port == 0 {
		for _, t := range connectors.SupportedTypes() {
			if t.ID == strings.ToLower(req.DBType) {
				req.Port = t.DefaultPort
				break
			}
		}
	}
	if req.SSLMode == "" {
		req.SSLMode = "prefer"
	}
	if req.SchemaName == "" {
		req.SchemaName = "public"
	}

	conn := models.DBConnection{
		ID:                uuid.New().String(),
		UserID:            userID,
		Name:              req.Name,
		DBType:            req.DBType,
		Host:              req.Host,
		Port:              req.Port,
		DatabaseName:      req.DatabaseName,
		Username:          req.Username,
		PasswordEncrypted: req.Password, // TODO: AES-256-GCM encryption in production
		SSLMode:           req.SSLMode,
		SchemaName:        req.SchemaName,
		IsActive:          true,
		CreatedAt:         time.Now(),
		UpdatedAt:         time.Now(),
	}
	if err := h.db.Create(&conn).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save connection"})
	}
	return c.Status(fiber.StatusCreated).JSON(conn)
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/connections/:id/test
// ─────────────────────────────────────────────────────────────────────────────

// TestConnection tests connectivity and latency to an external DB.
func (h *SchemaHandler) TestConnection(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	conn, err := h.loadConn(c.Params("id"), userID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Connection not found"})
	}

	if conn.DBType == "webhook" {
		now := time.Now()
		h.db.Model(conn).Update("last_synced_at", &now)
		return c.JSON(fiber.Map{
			"status":    "connected",
			"driver":    "webhook",
			"latencyMs": 0,
		})
	}

	opts := connectors.FromDBConnection(conn, conn.PasswordEncrypted)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	dbConn, err := connectors.Open(opts)
	if err != nil {
		return c.JSON(fiber.Map{"status": "error", "message": err.Error()})
	}
	defer dbConn.Close()

	latency, err := dbConn.Ping(ctx)
	if err != nil {
		return c.JSON(fiber.Map{"status": "error", "message": err.Error()})
	}

	// Update lastSyncedAt
	now := time.Now()
	h.db.Model(conn).Update("last_synced_at", &now)

	return c.JSON(fiber.Map{
		"status":    "connected",
		"driver":    dbConn.DriverName(),
		"latencyMs": latency,
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/connections/:id/sync — introspect and store schema
// ─────────────────────────────────────────────────────────────────────────────

// SyncSchema introspects the external DB and caches schema in SchemaTable.
func (h *SchemaHandler) SyncSchema(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	conn, err := h.loadConn(c.Params("id"), userID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Connection not found"})
	}

	if conn.DBType == "webhook" {
		now := time.Now()
		h.db.Model(conn).Update("last_synced_at", &now)
		return c.JSON(fiber.Map{
			"message":  "Webhooks sync automatically upon receiving data.",
			"tables":   0,
			"syncedAt": now,
		})
	}

	opts := connectors.FromDBConnection(conn, conn.PasswordEncrypted)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	dbConn, err := connectors.Open(opts)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": fmt.Sprintf("Cannot open connection: %s", err)})
	}
	defer dbConn.Close()

	schema := conn.SchemaName
	if schema == "" {
		schema = "public"
	}

	tables, err := dbConn.IntrospectSchema(ctx, schema)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": fmt.Sprintf("Introspection failed: %s", err)})
	}

	// Delete old schema entries for this connection
	h.db.Where("connection_id = ?", conn.ID).Delete(&models.SchemaTable{})

	// Insert fresh entries
	syncedAt := time.Now()
	for _, t := range tables {
		colsJSON, _ := marshalColumns(t.Columns)
		st := models.SchemaTable{
			ID:           uuid.New().String(),
			ConnectionID: conn.ID,
			TblName:      t.Name,
			SchemaName:   t.Schema,
			RowCount:     t.RowEst,
			TblType:      t.Type,
			Columns:      colsJSON,
			SyncedAt:     syncedAt,
		}
		h.db.Create(&st)
	}

	// Update lastSyncedAt
	h.db.Model(conn).Update("last_synced_at", &syncedAt)

	return c.JSON(fiber.Map{
		"message":  "Schema synced successfully",
		"tables":   len(tables),
		"syncedAt": syncedAt,
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/connections/:id/schema
// ─────────────────────────────────────────────────────────────────────────────

// GetSchema returns the cached schema tables for a connection.
func (h *SchemaHandler) GetSchema(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	conn, err := h.loadConn(c.Params("id"), userID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Connection not found"})
	}

	var tables []models.SchemaTable
	if err := h.db.Where("connection_id = ?", conn.ID).
		Order("table_name asc").Find(&tables).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch schema"})
	}

	if len(tables) == 0 {
		return c.JSON(fiber.Map{
			"data":   []interface{}{},
			"note":   "Schema not yet synced. Call POST /sync first.",
			"synced": false,
		})
	}
	return c.JSON(fiber.Map{
		"data":         tables,
		"connectionId": conn.ID,
		"synced":       true,
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/connections/:id/token
// ─────────────────────────────────────────────────────────────────────────────

// GetWebhookToken returns the authentication token for a webhook connection.
func (h *SchemaHandler) GetWebhookToken(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	conn, err := h.loadConn(c.Params("id"), userID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Connection not found"})
	}

	if conn.DBType != "webhook" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Token retrieval is only available for webhook connections"})
	}

	return c.JSON(fiber.Map{
		"token": conn.PasswordEncrypted,
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/connections/:id/create-dataset
// ─────────────────────────────────────────────────────────────────────────────

// CreateDataset provisions a Dataset referencing an external table schema.
func (h *SchemaHandler) CreateDataset(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	connID := c.Params("id")

	conn, err := h.loadConn(connID, userID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Connection not found"})
	}

	var req struct {
		TableName  string `json:"tableName"`
		SchemaName string `json:"schemaName"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if req.TableName == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "tableName is required"})
	}

	// Cari meta tabel dari SchemaTable hasil sync
	var schemaTable models.SchemaTable
	if err := h.db.Where("connection_id = ? AND table_name = ? AND schema_name = ?", connID, req.TableName, req.SchemaName).First(&schemaTable).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Schema table not found. Please sync connection first."})
	}

	ds := models.Dataset{
		UserID:        userID,
		Name:          fmt.Sprintf("%s / %s", conn.Name, req.TableName),
		FileName:      fmt.Sprintf("%s.%s", req.SchemaName, req.TableName),
		Columns:       schemaTable.Columns, // re-use columns from sync
		RowCount:      int(schemaTable.RowCount),
		SizeBytes:     0,
		StorageKey:    fmt.Sprintf("EXTERNAL_CONN::%s", connID), // Marker this is an external connection dataset
		DataTableName: fmt.Sprintf("%s.%s", req.SchemaName, req.TableName),
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}

	if err := h.db.Create(&ds).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create dataset"})
	}

	return c.Status(fiber.StatusCreated).JSON(ds)
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/connections/:id/query
// ─────────────────────────────────────────────────────────────────────────────

// QueryConnection executes a read-only SQL query on an external connection.
func (h *SchemaHandler) QueryConnection(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	conn, err := h.loadConn(c.Params("id"), userID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Connection not found"})
	}

	var req struct {
		SQL   string `json:"sql"`
		Limit int    `json:"limit"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if strings.TrimSpace(req.SQL) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "sql is required"})
	}
	if req.Limit <= 0 || req.Limit > 10000 {
		req.Limit = 500
	}

	if conn.DBType == "webhook" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Webhooks cannot be queried directly. Query their datasets instead."})
	}

	opts := connectors.FromDBConnection(conn, conn.PasswordEncrypted)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	dbConn, err := connectors.Open(opts)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": fmt.Sprintf("Connection failed: %s", err)})
	}
	defer dbConn.Close()

	result, err := dbConn.Query(ctx, req.SQL, req.Limit)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{
		"columns":    result.Columns,
		"data":       result.Rows,
		"rowCount":   result.RowCount,
		"durationMs": result.Duration,
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/v1/connections/:id
// ─────────────────────────────────────────────────────────────────────────────

// DeleteConnection soft-deletes a DB connection.
func (h *SchemaHandler) DeleteConnection(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if err := h.db.Model(&models.DBConnection{}).Where("id = ? AND user_id = ?", c.Params("id"), userID).
		Updates(map[string]interface{}{"is_active": false}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Delete failed"})
	}
	return c.Status(fiber.StatusNoContent).Send(nil)
}

// ─────────────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────────────

func (h *SchemaHandler) loadConn(id, userID string) (*models.DBConnection, error) {
	var conn models.DBConnection
	if err := h.db.Where("id = ? AND user_id = ?", id, userID).First(&conn).Error; err != nil {
		return nil, err
	}
	return &conn, nil
}

// marshalColumns serialises ColumnMeta slice to jsonb bytes.
func marshalColumns(cols []connectors.ColumnMeta) ([]byte, error) {
	return json.Marshal(cols)
}

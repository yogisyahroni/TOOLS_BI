package handlers

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"datalens/internal/models"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type WebhookHandler struct {
	db *gorm.DB
}

func NewWebhookHandler(db *gorm.DB) *WebhookHandler {
	return &WebhookHandler{db: db}
}

// HandleWebhook receives data from a 3rd party webhook connection.
// POST /api/v1/webhooks/:id
func (h *WebhookHandler) HandleWebhook(c *fiber.Ctx) error {
	connID := c.Params("id")
	authHeader := c.Get("Authorization")

	if authHeader == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Missing Authorization header"})
	}

	token := strings.TrimPrefix(authHeader, "Bearer ")
	if token == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid Authorization header format"})
	}

	var conn models.DBConnection
	if err := h.db.Where("id = ? AND db_type = 'webhook'", connID).First(&conn).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Webhook connection not found"})
	}

	if conn.PasswordEncrypted != token {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid webhook token"})
	}

	// Parse JSON payload (can be object or array)
	var payload interface{}
	if err := c.BodyParser(&payload); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid JSON payload"})
	}

	var rows []map[string]interface{}
	switch v := payload.(type) {
	case []interface{}:
		for _, item := range v {
			if m, ok := item.(map[string]interface{}); ok {
				rows = append(rows, m)
			}
		}
	case map[string]interface{}:
		rows = append(rows, v)
	default:
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Payload must be a JSON object or array of objects"})
	}

	if len(rows) == 0 {
		return c.Status(fiber.StatusOK).JSON(fiber.Map{"message": "No data to process"})
	}

	// Determine if dataset exists
	storageKey := fmt.Sprintf("WEBHOOK::%s", connID)
	var ds models.Dataset
	isNew := false

	err := h.db.Where("storage_key = ?", storageKey).First(&ds).Error
	if err != nil && err != gorm.ErrRecordNotFound {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Database error"})
	}
	if err == gorm.ErrRecordNotFound {
		isNew = true
	}

	var colDefs []models.ColumnDef
	if isNew {
		// Infer columns from the first row
		firstRow := rows[0]
		for key, val := range firstRow {
			colType := "string"
			switch val.(type) {
			case float64, int, int64:
				colType = "number"
			case bool:
				colType = "boolean"
			}
			colDefs = append(colDefs, models.ColumnDef{Name: key, Type: colType})
		}

		tableName := sanitizeTableName("wh_" + connID) // make it slightly different than regular ds_uuid
		if err := createDynamicTable(h.db, tableName, colDefs); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create dynamic table: " + err.Error()})
		}

		colJSON, _ := json.Marshal(colDefs)

		ds = models.Dataset{
			// Need a new UUID for the Dataset ID
			ID:            uuid.New().String(),
			UserID:        conn.UserID,
			Name:          fmt.Sprintf("Webhook: %s", conn.Name),
			FileName:      "webhook_stream",
			DataTableName: tableName,
			StorageKey:    storageKey,
			RowCount:      0,
			SizeBytes:     0,
			Columns:       json.RawMessage(colJSON),
			CreatedAt:     time.Now(),
			UpdatedAt:     time.Now(),
		}

		// Ensure we have a proper ID created for the Dataset
		if err := h.db.Create(&ds).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create dataset record: " + err.Error()})
		}
	} else {
		// Existing dataset
		json.Unmarshal(ds.Columns, &colDefs)
	}

	// Insert rows
	headers := make([]string, len(colDefs))
	for i, c := range colDefs {
		headers[i] = c.Name
	}

	strRows := make([][]string, 0, len(rows))
	for _, row := range rows {
		strRow := make([]string, len(headers))
		for i, h := range headers {
			if val, ok := row[h]; ok {
				strRow[i] = fmt.Sprintf("%v", val)
			} else {
				strRow[i] = ""
			}
		}
		strRows = append(strRows, strRow)
	}

	if err := bulkInsertRows(h.db, ds.DataTableName, headers, strRows); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to insert data: " + err.Error()})
	}

	// Update dataset row count
	h.db.Model(&ds).Update("row_count", gorm.Expr("row_count + ?", len(rows)))

	return c.Status(fiber.StatusOK).JSON(fiber.Map{"message": "Webhook processed successfully", "rowsInserted": len(rows)})
}

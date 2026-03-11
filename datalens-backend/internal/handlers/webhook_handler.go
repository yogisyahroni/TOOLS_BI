package handlers

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"datalens/internal/models"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

type WebhookHandler struct {
	db  *gorm.DB
	rdb *redis.Client
}

func NewWebhookHandler(db *gorm.DB, rdb *redis.Client) *WebhookHandler {
	return &WebhookHandler{db: db, rdb: rdb}
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
		if err := createWebhookDynamicTable(h.db, tableName, colDefs); err != nil {
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

		// Insert rows synchronously for the first time
		headers := make([]string, len(colDefs))
		for i, c := range colDefs {
			headers[i] = c.Name
		}

		strRows := make([][]string, 0, len(rows))
		for _, row := range rows {
			strRow := make([]string, len(headers))
			for i, header := range headers {
				if val, ok := row[header]; ok {
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

		return c.Status(fiber.StatusOK).JSON(fiber.Map{"message": "Webhook processed, table created successfully", "rowsInserted": len(rows)})
	}

	// FAST PATH: Existing dataset -> Push to Redis Queue
	queueKey := "webhook:queue"
	
	msg := map[string]interface{}{
		"conn_id": connID,
		"payload": rows,
	}
	msgBytes, _ := json.Marshal(msg)
	
	err = h.rdb.LPush(c.Context(), queueKey, msgBytes).Err()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to queue webhook data"})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{"message": "Webhook queued successfully", "rowsQueued": len(rows)})
}

// createWebhookDynamicTable uses Native PostgreSQL Partitioning by TIME and adds a BRIN index
func createWebhookDynamicTable(db *gorm.DB, tableName string, cols []models.ColumnDef) error {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf(`CREATE TABLE IF NOT EXISTS "%s" (`, tableName))
	sb.WriteString(`"_row_id" BIGSERIAL, `)
	sb.WriteString(`"_sys_created_at" TIMESTAMPTZ DEFAULT NOW(), `)

	for _, col := range cols {
		pgType := "TEXT"
		switch col.Type {
		case "number":
			pgType = "DOUBLE PRECISION"
		case "date":
			pgType = "TIMESTAMPTZ"
		}
		sb.WriteString(fmt.Sprintf(`"%s" %s, `, sanitizeIdentifier(col.Name), pgType))
	}

	sb.WriteString(`PRIMARY KEY ("_row_id", "_sys_created_at")`)
	sb.WriteString(`) PARTITION BY RANGE ("_sys_created_at")`)

	if err := db.Exec(sb.String()).Error; err != nil {
		return err
	}

	// Default partition ensures inserts don't fail immediately, even without specific time boundaries
	defaultPartition := fmt.Sprintf(`CREATE TABLE IF NOT EXISTS "%s_default" PARTITION OF "%s" DEFAULT`, tableName, tableName)
	if err := db.Exec(defaultPartition).Error; err != nil {
		return err
	}

	// BRIN index for highly optimized time-series scanning
	brinQuery := fmt.Sprintf(`CREATE INDEX IF NOT EXISTS "idx_%s_brin_sys" ON "%s" USING BRIN ("_sys_created_at")`, tableName, tableName)
	if err := db.Exec(brinQuery).Error; err != nil {
		return err
	}

	// Materialized View for quick hourly aggregation (reduces scan load for dashboard charts)
	mvName := fmt.Sprintf(`mv_%s_hourly`, tableName)
	mvQuery := fmt.Sprintf(`
		CREATE MATERIALIZED VIEW IF NOT EXISTS "%s" AS
		SELECT date_trunc('hour', "_sys_created_at") AS time_bucket, count(*) AS total_rows
		FROM "%s"
		GROUP BY 1
	`, mvName, tableName)
	
	if err := db.Exec(mvQuery).Error; err != nil {
		// Log but don't fail if we can't create MV
		fmt.Printf("Warning: Failed to create materialized view: %v\n", err)
		return nil
	}

	// Unique index allows REFRESH MATERIALIZED VIEW CONCURRENTLY later on
	idxQuery := fmt.Sprintf(`CREATE UNIQUE INDEX IF NOT EXISTS "idx_%s_uniq" ON "%s" (time_bucket)`, mvName, mvName)
	if err := db.Exec(idxQuery).Error; err != nil {
		fmt.Printf("Warning: Failed to create unique index on materialized view: %v\n", err)
	}

	return nil
}

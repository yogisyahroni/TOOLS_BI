package handlers

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"neuradash/internal/middleware"
	"neuradash/internal/models"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

// ExportHandler handles data export operations.
type ExportHandler struct {
	db *gorm.DB
}

// NewExportHandler creates a new ExportHandler.
func NewExportHandler(db *gorm.DB) *ExportHandler {
	return &ExportHandler{db: db}
}

// ExportDataset exports dataset rows as CSV, JSON, or Markdown.
// GET /api/v1/datasets/:id/export?format=csv|json|markdown&limit=1000
func (h *ExportHandler) ExportDataset(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	datasetID := c.Params("id")
	format := strings.ToLower(c.Query("format", "csv"))
	limit := c.QueryInt("limit", 1000)
	if limit > 10000 {
		limit = 10000
	}

	// Verify ownership
	var dataset models.Dataset
	if err := h.db.Where("id = ? AND user_id = ?", datasetID, userID).First(&dataset).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Dataset not found"})
	}

	// Query the dynamic table
	tableName := "ds_" + strings.ReplaceAll(datasetID, "-", "_")
	var rows []map[string]interface{}
	rawRows, err := h.db.Raw(fmt.Sprintf(`SELECT * FROM "%s" LIMIT %d`, tableName, limit)).Rows()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Query failed: " + err.Error()})
	}
	defer rawRows.Close()

	cols, err := rawRows.Columns()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Column fetch failed"})
	}
	for rawRows.Next() {
		values := make([]interface{}, len(cols))
		valuePtrs := make([]interface{}, len(cols))
		for i := range values {
			valuePtrs[i] = &values[i]
		}
		if err := rawRows.Scan(valuePtrs...); err != nil {
			continue
		}
		row := make(map[string]interface{}, len(cols))
		for i, col := range cols {
			row[col] = values[i]
		}
		rows = append(rows, row)
	}

	filename := fmt.Sprintf("%s_%s", strings.ReplaceAll(dataset.Name, " ", "_"), time.Now().Format("20060102"))

	switch format {
	case "json":
		jsonBytes, err := json.MarshalIndent(rows, "", "  ")
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "JSON encoding failed"})
		}
		c.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.json"`, filename))
		c.Set("Content-Type", "application/json")
		return c.Send(jsonBytes)

	case "markdown":
		var sb strings.Builder
		sb.WriteString(fmt.Sprintf("# %s\n\n", dataset.Name))
		sb.WriteString(fmt.Sprintf("**Exported:** %s | **Rows:** %d\n\n", time.Now().Format(time.RFC3339), len(rows)))
		if len(rows) > 0 {
			// Header
			sb.WriteString("| " + strings.Join(cols, " | ") + " |\n")
			sb.WriteString("|" + strings.Repeat(" --- |", len(cols)) + "\n")
			// Rows
			for _, row := range rows {
				vals := make([]string, len(cols))
				for i, col := range cols {
					vals[i] = fmt.Sprintf("%v", row[col])
				}
				sb.WriteString("| " + strings.Join(vals, " | ") + " |\n")
			}
		}
		c.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.md"`, filename))
		c.Set("Content-Type", "text/markdown")
		return c.SendString(sb.String())

	default: // csv
		var buf bytes.Buffer
		w := csv.NewWriter(&buf)
		// Header
		if err := w.Write(cols); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "CSV write failed"})
		}
		for _, row := range rows {
			record := make([]string, len(cols))
			for i, col := range cols {
				record[i] = fmt.Sprintf("%v", row[col])
			}
			if err := w.Write(record); err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "CSV row write failed"})
			}
		}
		w.Flush()
		if err := w.Error(); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "CSV flush failed"})
		}
		c.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.csv"`, filename))
		c.Set("Content-Type", "text/csv; charset=utf-8")
		return c.Send(buf.Bytes())
	}
}

// ExportReport exports a report as Markdown.
// GET /api/v1/reports/:id/export
func (h *ExportHandler) ExportReport(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var report models.Report
	if err := h.db.Where("id = ? AND user_id = ?", c.Params("id"), userID).First(&report).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Report not found"})
	}

	content := fmt.Sprintf("# %s\n\n**Generated:** %s\n\n%s", report.Title, report.CreatedAt.Format(time.RFC3339), report.Content)
	filename := strings.ReplaceAll(report.Title, " ", "_")
	c.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.md"`, filename))
	c.Set("Content-Type", "text/markdown")
	return c.SendString(content)
}

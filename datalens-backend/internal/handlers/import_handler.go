package handlers

import (
	"bytes"
	"fmt"
	"io"
	"time"

	"datalens/internal/middleware"
	"datalens/internal/models"
	"datalens/internal/parser"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ImportHandler handles template/report import from .pbix, .twb, .twbx, .pptx files.
type ImportHandler struct {
	db *gorm.DB
}

// NewImportHandler creates a new ImportHandler.
func NewImportHandler(db *gorm.DB) *ImportHandler {
	return &ImportHandler{db: db}
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/import/supported
// ─────────────────────────────────────────────────────────────────────────────

// GetSupportedFormats returns supported file extensions.
func (h *ImportHandler) GetSupportedFormats(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"formats": parser.SupportedExtensions(),
		"note":    "Upload your Power BI .pbix, Tableau .twb/.twbx, or PowerPoint .pptx file to import a report template.",
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/import/parse
// ─────────────────────────────────────────────────────────────────────────────

// ParseFile parses an uploaded file and returns the parsed report structure
// WITHOUT saving it. Used for preview before confirming import.
func (h *ImportHandler) ParseFile(c *fiber.Ctx) error {
	file, err := c.FormFile("file")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "file field is required (multipart/form-data)",
		})
	}

	// Size limit: 100 MB
	if file.Size > 100*1024*1024 {
		return c.Status(fiber.StatusRequestEntityTooLarge).JSON(fiber.Map{
			"error": fmt.Sprintf("file too large: %d bytes (max 100 MB)", file.Size),
		})
	}

	// Read entire file into memory so we can pass io.ReaderAt
	src, err := file.Open()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "cannot open uploaded file"})
	}
	defer src.Close()

	buf, err := io.ReadAll(src)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "cannot read file"})
	}

	parsed, err := parser.ParseFile(bytes.NewReader(buf), int64(len(buf)), file.Filename)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{
		"parsed":    parsed,
		"filename":  file.Filename,
		"sizeBytes": file.Size,
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/import/confirm
// ─────────────────────────────────────────────────────────────────────────────

// ConfirmImport accepts an uploaded file, parses it, and creates ReportTemplate
// + Report records from the extracted structure. This is the "save" step after preview.
func (h *ImportHandler) ConfirmImport(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	file, err := c.FormFile("file")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "file field is required"})
	}
	if file.Size > 100*1024*1024 {
		return c.Status(fiber.StatusRequestEntityTooLarge).JSON(fiber.Map{"error": "file too large (max 100 MB)"})
	}

	src, err := file.Open()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "cannot open file"})
	}
	defer src.Close()

	buf, err := io.ReadAll(src)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "cannot read file"})
	}

	parsed, err := parser.ParseFile(bytes.NewReader(buf), int64(len(buf)), file.Filename)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}

	// ── Build a ReportTemplate record ────────────────────────────────────────
	now := time.Now()
	templateID := uuid.New().String()

	// Compose thumbnail-like description
	pagesDesc := fmt.Sprintf("%d page(s)", len(parsed.Pages))
	if len(parsed.DataSources) > 0 {
		pagesDesc += fmt.Sprintf(", %d data source(s)", len(parsed.DataSources))
	}

	template := models.ReportTemplate{
		ID:          templateID,
		Name:        parsed.Title,
		Description: fmt.Sprintf("Imported from %s (%s). %s.", parsed.SourceType, file.Filename, pagesDesc),
		Category:    "imported",
		Source:      parsed.SourceType, // powerbi | tableau | pptx
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if err := h.db.Create(&template).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to save template"})
	}

	// ── Optionally create a Report stub for each page ─────────────────────────
	var reports []models.Report
	for i, pg := range parsed.Pages {
		if i >= 10 { // cap at 10 pages-as-reports
			break
		}
		rpt := models.Report{
			ID:        uuid.New().String(),
			UserID:    userID,
			Title:     fmt.Sprintf("%s — %s", parsed.Title, pg.Name),
			CreatedAt: now,
		}
		h.db.Create(&rpt)
		reports = append(reports, rpt)
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"template": template,
		"reports":  reports,
		"parsed":   parsed,
		"message":  fmt.Sprintf("Successfully imported %d page(s) from %s", len(parsed.Pages), file.Filename),
	})
}

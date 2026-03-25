package handlers

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"

	"datalens/internal/config"
	"datalens/internal/models"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

// MigrationHandler handles extracting files and using AI to convert to DataLens templates
type MigrationHandler struct {
	db     *gorm.DB
	aiConf config.AIConfig
}

// NewMigrationHandler creates a new MigrationHandler
func NewMigrationHandler(db *gorm.DB, aiConf config.AIConfig) *MigrationHandler {
	return &MigrationHandler{db: db, aiConf: aiConf}
}

// ImportBIFile extracts the uploaded BI file and uses AI to generate a DataLens ReportTemplate.
// POST /api/v1/templates/import
func (h *MigrationHandler) ImportBIFile(c *fiber.Ctx) error {
	file, err := c.FormFile("file")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "File upload missing"})
	}

	ext := strings.ToLower(filepath.Ext(file.Filename))
	if ext != ".pbix" && ext != ".twb" && ext != ".twbx" && ext != ".pptx" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Unsupported file type. Use .pbix, .twb, .twbx, or .pptx"})
	}

	openedFile, err := file.Open()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to open file"})
	}
	defer openedFile.Close()

	fileBytes, err := io.ReadAll(openedFile)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to read file"})
	}

	var rawLayout string

	// Extract layout config strings based on BI tool
	switch ext {
	case ".pbix":
		rawLayout, err = h.extractPowerBI(fileBytes, file.Size)
	case ".pptx":
		rawLayout, err = h.extractPowerPoint(fileBytes, file.Size)
	case ".twb", ".twbx":
		// .twb is XML. .twbx is ZIP containing .twb
		if ext == ".twbx" {
			rawLayout, err = h.extractTableauZip(fileBytes, file.Size)
		} else {
			rawLayout = string(fileBytes) // Raw XML
		}
	}

	if err != nil || len(strings.TrimSpace(rawLayout)) == 0 {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": "Failed to extract layout metadata: " + err.Error()})
	}

	// Truncate to avoid blowing up AI context limits (e.g. 100k chars ~ 25k tokens)
	maxChars := 150000
	if len(rawLayout) > maxChars {
		rawLayout = rawLayout[:maxChars]
	}

	// Make AI Call to transform raw layout to DataLens Template
	cfg := resolvedConfig{
		Provider:  h.aiConf.Provider,
		APIKey:    h.aiConf.APIKey,
		Model:     h.aiConf.Model,
		MaxTokens: 4096, // Increase max tokens for large json
		BaseURL:   h.aiConf.BaseURL,
	}

	if cfg.APIKey == "" {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "Server AI_API_KEY is not configured for migration."})
	}

	fmt.Printf("Generating AI Template for %s. Size: %d chars\n", file.Filename, len(rawLayout))

	prompt := BuildTemplateMigrationPrompt(ext, rawLayout)
	content, err := h.callOpenAIMigrate(cfg, prompt)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "AI conversion failed: " + err.Error()})
	}

	content = strings.TrimSpace(content)
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimPrefix(content, "```")
	content = strings.TrimSuffix(content, "```")
	content = strings.TrimSpace(content)

	var newTemplate models.ReportTemplate
	if err := json.Unmarshal([]byte(content), &newTemplate); err != nil {
		fmt.Println("AI Output:", content)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "AI generated invalid JSON structure"})
	}

	// Assign dynamic metadata
	newTemplate.Name = fmt.Sprintf("Imported from %s", file.Filename)
	if ext == ".pbix" {
		newTemplate.Source = "PowerBI"
	} else if ext == ".twb" || ext == ".twbx" {
		newTemplate.Source = "Tableau"
	} else {
		newTemplate.Source = "PowerPoint"
	}

	newTemplate.IsDefault = false

	if err := h.db.Create(&newTemplate).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save template to database"})
	}

	return c.Status(fiber.StatusCreated).JSON(newTemplate)
}

// ─────────────────────────────────────────────────────────────────────────────
// Extraction Helpers
// ─────────────────────────────────────────────────────────────────────────────

func (h *MigrationHandler) extractPowerBI(data []byte, size int64) (string, error) {
	reader, err := zip.NewReader(bytes.NewReader(data), size)
	if err != nil {
		return "", err
	}
	var sb strings.Builder
	for _, f := range reader.File {
		// Look for the Report/Layout file inside the .pbix ZIP container
		if strings.Contains(f.Name, "Report/Layout") {
			rc, err := f.Open()
			if err != nil {
				return "", err
			}
			b, err := io.ReadAll(rc)
			rc.Close()
			if err != nil {
				return "", err
			}
			// Note: The Layout file is usually UTF-16LE, we simplify here for now
			// but AI can generally read the raw string shape.
			sb.Write(b)
		}
	}
	if sb.Len() == 0 {
		return "", fmt.Errorf("Report/Layout not found inside .pbix (could be Live Connected / Live Tabular)")
	}
	return sb.String(), nil
}

func (h *MigrationHandler) extractPowerPoint(data []byte, size int64) (string, error) {
	reader, err := zip.NewReader(bytes.NewReader(data), size)
	if err != nil {
		return "", err
	}
	var sb strings.Builder
	for _, f := range reader.File {
		// Extract slides and theme colors
		if strings.HasPrefix(f.Name, "ppt/slides/slide") || strings.HasPrefix(f.Name, "ppt/theme/") {
			rc, err := f.Open()
			if err != nil {
				continue
			}
			b, err := io.ReadAll(rc)
			rc.Close()
			if err == nil {
				sb.WriteString(f.Name + ":\n")
				sb.Write(b)
				sb.WriteString("\n---\n")
			}
		}
	}
	return sb.String(), nil
}

func (h *MigrationHandler) extractTableauZip(data []byte, size int64) (string, error) {
	reader, err := zip.NewReader(bytes.NewReader(data), size)
	if err != nil {
		return "", err
	}
	for _, f := range reader.File {
		if strings.HasSuffix(f.Name, ".twb") {
			rc, err := f.Open()
			if err != nil {
				return "", err
			}
			b, err := io.ReadAll(rc)
			rc.Close()
			if err != nil {
				return "", err
			}
			return string(b), nil
		}
	}
	return "", fmt.Errorf(".twb not found inside .twbx")
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Proxy Helper for Migration (Separate to avoid coupling with AIHandler context)
// ─────────────────────────────────────────────────────────────────────────────

func (h *MigrationHandler) callOpenAIMigrate(cfg resolvedConfig, prompt string) (string, error) {
	baseURL := cfg.BaseURL
	if baseURL == "" {
		baseURL = providerBaseURL(cfg.Provider)
	}

	reqBody := map[string]interface{}{
		"model":      cfg.Model,
		"messages":   []map[string]string{{"role": "user", "content": prompt}},
		"max_tokens": cfg.MaxTokens,
		// Lower temp so we get strict JSON outputs
		"temperature": 0.1,
	}
	data, _ := json.Marshal(reqBody)
	httpReq, err := http.NewRequest("POST", baseURL+"/chat/completions", bytes.NewReader(data))
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+cfg.APIKey)

	resp, err := (&http.Client{}).Do(httpReq)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("AI API error %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("failed to decode AI response: %w", err)
	}
	if len(result.Choices) == 0 {
		return "", fmt.Errorf("AI returned no choices")
	}
	return result.Choices[0].Message.Content, nil
}

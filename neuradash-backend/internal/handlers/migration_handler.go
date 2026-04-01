package handlers

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"

	"neuradash/internal/config"
	"neuradash/internal/crypto"
	"neuradash/internal/middleware"
	"neuradash/internal/models"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

// MigrationHandler handles extracting files and using AI to convert to DataLens templates
type MigrationHandler struct {
	db            *gorm.DB
	aiConf        config.AIConfig
	encryptionKey string
}

// NewMigrationHandler creates a new MigrationHandler
func NewMigrationHandler(db *gorm.DB, aiConf config.AIConfig, encryptionKey string) *MigrationHandler {
	return &MigrationHandler{db: db, aiConf: aiConf, encryptionKey: encryptionKey}
}

// resolveUserConfig loads and decrypts the user's AI config from the database.
// Falls back to the server-level AI_API_KEY when no user config is found.
func (h *MigrationHandler) resolveUserConfig(userID string) (resolvedConfig, error) {
	var userCfg models.UserAIConfig
	err := h.db.Where("user_id = ?", userID).First(&userCfg).Error

	// If user has saved their own config, use it
	if err == nil {
		if userCfg.EncryptedAPIKey == "" {
			return resolvedConfig{}, fmt.Errorf("AI not configured: no API key saved")
		}
		rawKey, decryptErr := crypto.Decrypt(userCfg.EncryptedAPIKey, h.encryptionKey)
		if decryptErr != nil {
			return resolvedConfig{}, fmt.Errorf("failed to decrypt API key: %w", decryptErr)
		}
		return resolvedConfig{
			Provider:    userCfg.Provider,
			APIKey:      rawKey,
			Model:       userCfg.Model,
			MaxTokens:   userCfg.MaxTokens,
			Temperature: userCfg.Temperature,
			BaseURL:     userCfg.BaseURL,
		}, nil
	}

	// Record not found — fall back to server-level env config
	if errors.Is(err, gorm.ErrRecordNotFound) {
		if h.aiConf.APIKey == "" {
			return resolvedConfig{}, fmt.Errorf("AI not configured. Save your API key in Settings.")
		}
		return resolvedConfig{
			Provider:  h.aiConf.Provider,
			APIKey:    h.aiConf.APIKey,
			Model:     h.aiConf.Model,
			MaxTokens: h.aiConf.MaxTokens,
			BaseURL:   h.aiConf.BaseURL,
		}, nil
	}

	return resolvedConfig{}, fmt.Errorf("DB error loading AI config: %w", err)
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

	// Smart filtering for large layouts to fit AI limits (TPM: 12,000 for Groq free/on_demand)
	// We remove null bytes (UTF-16LE artifacts) and limit to a safe character count.
	// 25k chars is ~6k tokens, well within 12k TPM limits.
	maxChars := 25000
	if len(rawLayout) > maxChars {
		fmt.Printf("Warning: Layout from %s is large (%d chars). Truncating to %d chars to fit AI context.\n", file.Filename, len(rawLayout), maxChars)
		rawLayout = rawLayout[:maxChars]
	}

	// Make AI Call to transform raw layout to DataLens Template
	userID := middleware.GetUserID(c)
	cfg, err := h.resolveUserConfig(userID)
	if err != nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "AI not configured for migration: " + err.Error()})
	}
	cfg.MaxTokens = 4096 // Ensure enough tokens for translation

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
	newTemplate.UserID = &userID
	newTemplate.ID = "" // Let DB generate a fresh, unique UUID

	if newTemplate.Category == "" {
		newTemplate.Category = "custom"
	}


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
		if strings.Contains(strings.ToLower(f.Name), "report/layout") {
			rc, err := f.Open()
			if err != nil {
				return "", err
			}
			b, err := io.ReadAll(rc)
			rc.Close()
			if err != nil {
				return "", err
			}
			
			// Handle UTF-16LE to UTF-8 cleaning by removing null bytes if common.
			// PowerBI Layout files are usually UTF-16LE. If we find nulls every other byte, strip them.
			// This immediately reduces payload size by ~50%.
			cleaned := bytes.ReplaceAll(b, []byte{0}, []byte{})
			sb.Write(cleaned)
		}
	}
	if sb.Len() == 0 {
		return "", fmt.Errorf("Report/Layout not found inside .pbix (could be Live Connected / Live Tabular)")
	}
	
	result := sb.String()
	
	// Smart JSON Filtering for PowerBI if too large
	// If it looks like JSON, we can try to strip out huge "config" blocks that are just styling.
	if len(result) > 10000 && strings.Contains(result, "\"sections\"") {
		// A very rough regex-based string cleaning to keep structure but strip bloat
		// This is safer than a full JSON unmarshal which might fail on partial reads/formats.
		result = strings.ReplaceAll(result, "\\\"", "\"")
		// (Optional) add more aggressive filtering if needed here
	}

	return result, nil
}

func (h *MigrationHandler) extractPowerPoint(data []byte, size int64) (string, error) {
	reader, err := zip.NewReader(bytes.NewReader(data), size)
	if err != nil {
		return "", err
	}
	var sb strings.Builder
	for _, f := range reader.File {
		name := strings.ToLower(f.Name)
		// Extract slides and theme colors (case-insensitive prefixes)
		if strings.HasPrefix(name, "ppt/slides/slide") || strings.HasPrefix(name, "ppt/theme/") {
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
		if strings.HasSuffix(strings.ToLower(f.Name), ".twb") {
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

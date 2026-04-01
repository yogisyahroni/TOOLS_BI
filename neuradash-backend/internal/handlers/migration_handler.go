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
	"regexp"
	"strings"
	"time"

	"neuradash/internal/config"
	"neuradash/internal/crypto"
	"neuradash/internal/middleware"
	"neuradash/internal/models"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Internal types for template data sanitization
type importedPage struct {
	ID       string            `json:"id"`
	Title    string            `json:"title"`
	Subtitle string            `json:"subtitle"`
	Filters  []string          `json:"filters"`
	Sections []importedSection `json:"sections"`
}

type importedSection struct {
	ID     string      `json:"id"`
	Type   string      `json:"type"`
	Title  string      `json:"title"`
	Width  string      `json:"width"`
	Height string      `json:"height"`
	Config interface{} `json:"config"`
}

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
	// Self-healing schema: ensure table exists and has all columns (e.g. migration_status)
	// This prevents 500 errors in production when new columns are added to models.
	if err := h.db.AutoMigrate(&models.ReportTemplate{}); err != nil {
		fmt.Printf("Warning: AutoMigrate failed: %v\n", err)
		// We continue, as the table might already be correct or migration might be blocked by permissions.
	}

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

	fmt.Printf("Detected file %s. Extracting pages for migration...\n", file.Filename)

	var pages []string

	// Phase 1: Structural Extraction (Local)
	switch ext {
	case ".pbix":
		pages, err = h.extractPagesPowerBI(fileBytes, file.Size)
	case ".pptx":
		pages, err = h.extractPagesPPTX(fileBytes, file.Size)
	case ".twb", ".twbx":
		if ext == ".twbx" {
			pages, err = h.extractPagesTableauZip(fileBytes, file.Size)
		} else {
			pages, err = h.extractPagesTableau(string(fileBytes))
		}
	}

	if err != nil || len(pages) == 0 {
		errMsg := "Failed to extract layout metadata"
		if err != nil {
			errMsg += ": " + err.Error()
		}
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": errMsg})
	}

	// Phase 2: Create Placeholder Template & Return JobID
	userID := middleware.GetUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized: No user ID found"})
	}

	cfg, err := h.resolveUserConfig(userID)
	if err != nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "AI not configured: " + err.Error()})
	}
	cfg.MaxTokens = 4096

	status := fiber.Map{
		"status":       "processing",
		"current_page": 0,
		"total_pages":  len(pages),
		"started_at":   time.Now(),
		"message":      "Extraction successful. AI is processing pages...",
	}
	statusJSON, _ := json.Marshal(status)

	newTemplate := models.ReportTemplate{
		ID:              uuid.New().String(),
		UserID:          &userID,
		Name:            fmt.Sprintf("Importing: %s", file.Filename),
		Source:          strings.TrimPrefix(ext, "."),
		Category:        "custom",
		IsDefault:       false,
		MigrationStatus: json.RawMessage(statusJSON),
		CreatedAt:       time.Now(),
		UpdatedAt:       time.Now(),
	}

	if err := h.db.Create(&newTemplate).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to initialize migration job"})
	}

	// Phase 3: Start Asynchronous Worker
	go h.processMigrationJob(newTemplate.ID, pages, &cfg, ext)

	// Return the template ID immediately so frontend can poll status
	return c.Status(fiber.StatusAccepted).JSON(newTemplate)
}

// ─────────────────────────────────────────────────────────────────────────────
// Structural Page Extraction Helpers
// ─────────────────────────────────────────────────────────────────────────────

func (h *MigrationHandler) extractPagesPowerBI(data []byte, size int64) ([]string, error) {
	reader, err := zip.NewReader(bytes.NewReader(data), size)
	if err != nil {
		return nil, err
	}
	
	var layoutRaw []byte
	for _, f := range reader.File {
		if strings.Contains(strings.ToLower(f.Name), "report/layout") {
			rc, err := f.Open()
			if err != nil {
				return nil, err
			}
			layoutRaw, _ = io.ReadAll(rc)
			rc.Close()
			break
		}
	}
	
	if len(layoutRaw) == 0 {
		return nil, fmt.Errorf("Report/Layout not found inside .pbix")
	}

	// PowerBI Layout is UTF-16LE. Clean it.
	cleaned := bytes.ReplaceAll(layoutRaw, []byte{0}, []byte{})
	
	// Parse as generic JSON to find sections (pages)
	var layoutObj struct {
		Sections []json.RawMessage `json:"sections"`
	}
	if err := json.Unmarshal(cleaned, &layoutObj); err != nil {
		return []string{string(cleaned)}, nil
	}

	var pages []string
	for _, s := range layoutObj.Sections {
		pages = append(pages, string(s))
	}
	
	if len(pages) == 0 {
		return []string{string(cleaned)}, nil
	}

	return pages, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// Asynchronous Migration Worker & TPM Guard
// ─────────────────────────────────────────────────────────────────────────────

func (h *MigrationHandler) processMigrationJob(templateID string, pages []string, cfg *resolvedConfig, fileExt string) {
	fmt.Printf("Worker started for Job %s. Total pages: %d\n", templateID, len(pages))

	var allPages []json.RawMessage
	var colorScheme json.RawMessage

	// Simple Token Tracker for TPM Guard
	tokensUsedThisMinute := 0
	minuteStart := time.Now()

	modelTPM := 11000 // Default for free models like Lyria
	if strings.Contains(strings.ToLower(cfg.Model), "gpt-4") || strings.Contains(strings.ToLower(cfg.Model), "claude-3") {
		modelTPM = 40000 // Higher limit for paid models
	}

	for i, pageContent := range pages {
		// 1. TPM Guard check
		estimatedTokens := len(pageContent) / 3 // Conservative: 3 chars per token for dense metadata
		if tokensUsedThisMinute+estimatedTokens > modelTPM {
			sleepDur := time.Until(minuteStart.Add(61 * time.Second))
			fmt.Printf("TPM Limit reached for job %s. Sleeping for %v...\n", templateID, sleepDur)
			time.Sleep(sleepDur)
			tokensUsedThisMinute = 0
			minuteStart = time.Now()
		}

		// 2. Call AI for this chunk
		prompt := BuildTemplateMigrationPrompt(fileExt, pageContent)
		aiOutput, err := h.callOpenAIMigrate(*cfg, prompt)
		if err != nil {
			h.updateMigrationError(templateID, fmt.Sprintf("Failed at page %d: %v", i+1, err))
			return
		}

		// 3. Clean and Parse AI Output
		aiOutput = h.cleanAIJson(aiOutput)
		var chunkTemplate models.ReportTemplate
		if err := json.Unmarshal([]byte(aiOutput), &chunkTemplate); err == nil {
			// Extract pages and color scheme from the first successful chunk
			if i == 0 {
				colorScheme = chunkTemplate.ColorScheme
			}
			var chunkPages []json.RawMessage
			json.Unmarshal(chunkTemplate.Pages, &chunkPages)
			allPages = append(allPages, chunkPages...)
		}

		// 4. Update Progress in DB
		tokensUsedThisMinute += estimatedTokens
		h.updateMigrationProgress(templateID, i+1, len(pages), allPages, colorScheme)
	}

	// 5. Finalize
	h.finalizeMigration(templateID)
}

func (h *MigrationHandler) cleanAIJson(s string) string {
	s = strings.TrimSpace(s)
	s = strings.TrimPrefix(s, "```json")
	s = strings.TrimPrefix(s, "```")
	s = strings.TrimSuffix(s, "```")
	return strings.TrimSpace(s)
}

func (h *MigrationHandler) updateMigrationProgress(id string, current, total int, pages []json.RawMessage, colors json.RawMessage) {
	status := fiber.Map{
		"status":       "processing",
		"current_page": current,
		"total_pages":  total,
		"updated_at":   time.Now(),
	}
	statusJSON, _ := json.Marshal(status)
	pagesJSON, _ := json.Marshal(pages)

	h.db.Model(&models.ReportTemplate{}).Where("id = ?", id).Updates(map[string]interface{}{
		"migration_status": json.RawMessage(statusJSON),
		"pages":            json.RawMessage(pagesJSON),
		"color_scheme":     colors,
		"updated_at":       time.Now(),
	})
}

func (h *MigrationHandler) updateMigrationError(id string, err string) {
	status := fiber.Map{
		"status":     "failed",
		"error":      err,
		"updated_at": time.Now(),
	}
	statusJSON, _ := json.Marshal(status)
	h.db.Model(&models.ReportTemplate{}).Where("id = ?", id).Update("migration_status", json.RawMessage(statusJSON))
}

func (h *MigrationHandler) finalizeMigration(id string) {
	status := fiber.Map{
		"status":     "completed",
		"updated_at": time.Now(),
	}
	statusJSON, _ := json.Marshal(status)
	h.db.Model(&models.ReportTemplate{}).Where("id = ?", id).Update("migration_status", json.RawMessage(statusJSON))
}

func (h *MigrationHandler) extractPagesPPTX(data []byte, size int64) ([]string, error) {
	reader, err := zip.NewReader(bytes.NewReader(data), size)
	if err != nil {
		return nil, err
	}

	var pages []string
	// Slides are usually in ppt/slides/slideN.xml
	for _, f := range reader.File {
		if strings.HasPrefix(f.Name, "ppt/slides/slide") && strings.HasSuffix(f.Name, ".xml") {
			rc, err := f.Open()
			if err != nil {
				continue
			}
			content, _ := io.ReadAll(rc)
			rc.Close()
			pages = append(pages, string(content))
		}
	}
	
	if len(pages) == 0 {
		return nil, fmt.Errorf("No slides found in .pptx")
	}
	return pages, nil
}

func (h *MigrationHandler) extractPagesTableauZip(data []byte, size int64) ([]string, error) {
	reader, err := zip.NewReader(bytes.NewReader(data), size)
	if err != nil {
		return nil, err
	}

	for _, f := range reader.File {
		if strings.HasSuffix(f.Name, ".twb") {
			rc, err := f.Open()
			if err != nil {
				return nil, err
			}
			content, _ := io.ReadAll(rc)
			rc.Close()
			return h.extractPagesTableau(string(content))
		}
	}
	return nil, fmt.Errorf(".twb not found inside .twbx")
}

func (h *MigrationHandler) extractPagesTableau(xmlContent string) ([]string, error) {
	// Tableau XML is hierarchical. We look for <dashboards> or <worksheets>
	// For simplicity, we can split by <dashboard> and <worksheet> tags
	cleanXML := cleanTableauXML(xmlContent)
	
	var pages []string
	// Basic regex or string split as a fallback for structural chunking
	parts := strings.Split(cleanXML, "<dashboard ")
	for i, p := range parts {
		if i == 0 && !strings.Contains(p, "<worksheet ") {
			continue // Skip prolog
		}
		if strings.Contains(p, "</dashboard>") {
			pages = append(pages, "<dashboard "+strings.Split(p, "</dashboard>")[0]+"</dashboard>")
		}
	}

	worksheets := strings.Split(cleanXML, "<worksheet ")
	for i, p := range worksheets {
		if i == 0 { continue }
		if strings.Contains(p, "</worksheet>") {
			pages = append(pages, "<worksheet "+strings.Split(p, "</worksheet>")[0]+"</worksheet>")
		}
	}

	if len(pages) == 0 {
		return []string{cleanXML}, nil // Return everything if no pages found
	}
	return pages, nil
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

// cleanTableauXML removes the huge <datasources> block from a .twb file
// as it contains metadata irrelevant to the visual layout, allowing more "signal"
// (worksheets and dashboards) to fit within AI context limits.
func cleanTableauXML(xml string) string {
	re := regexp.MustCompile(`(?s)<datasources>.*?</datasources>`)
	return re.ReplaceAllString(xml, "<datasources>[OMITTED_FOR_LAYOUT_MIGRATION]</datasources>")
}

package services

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"sync"
	"time"

	"neuradash/internal/crypto"
	"neuradash/internal/models"
	"neuradash/internal/realtime"

	"github.com/sashabaranov/go-openai"
	"gorm.io/gorm"
)

// AIService handles AI-powered NL2SQL generation with security safeguards
type AIService struct {
	client   *openai.Client
	model    string
	provider string
	// Security: query allowlist untuk critical operations
	allowedReadOnly bool // default true, set false untuk admin

	// Pillar Dependencies
	integrationSvc   *IntegrationService
	notificationSvc  *NotificationService
	db               *gorm.DB
	hub              *realtime.Hub
	encryptionKey    string
	mu               sync.RWMutex
	analysisCooldown map[string]time.Time // datasetID -> lastTime
}

// NewAIService creates a new AI service dengan security defaults
func NewAIService(apiKey string, readOnly bool, db *gorm.DB, hub *realtime.Hub, intSvc *IntegrationService, notifSvc *NotificationService, encKey string) *AIService {
	return &AIService{
		client:           openai.NewClient(apiKey),
		model:            openai.GPT4TurboPreview,
		provider:         "openai",
		allowedReadOnly:  readOnly,
		db:               db,
		hub:              hub,
		integrationSvc:   intSvc,
		notificationSvc:  notifSvc,
		encryptionKey:    encKey,
		analysisCooldown: make(map[string]time.Time),
	}
}

// GenerateSQLResult complete NL2SQL output dengan security metadata
type GenerateSQLResult struct {
	SQL              string   `json:"sql"`
	Confidence       float64  `json:"confidence"`
	Explanation      string   `json:"explanation"`
	ExecutionPlan    string   `json:"execution_plan"`
	RequiresApproval bool     `json:"requires_approval"`
	Alternatives     []string `json:"alternatives,omitempty"`
	Provider         string   `json:"provider"`
	LatencyMs        int64    `json:"latency_ms"`
	// Security fields
	IsSafeToExecute  bool     `json:"is_safe_to_execute"` // true jika lolos semua check
	SecurityWarnings []string `json:"security_warnings"`  // list of issues
	QueryType        string   `json:"query_type"`         // SELECT, INSERT, UPDATE, DELETE, etc
}

// Schema represents database schema untuk context
type Schema struct {
	Tables []Table `json:"tables"`
}

type Table struct {
	Name    string   `json:"name"`
	Columns []Column `json:"columns"`
}

type Column struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

// GenerateSQL generates SQL dari natural language dengan multi-layer security
func (s *AIService) GenerateSQL(ctx context.Context, question string, schema Schema) (*GenerateSQLResult, error) {
	start := time.Now()

	// Layer 1: Input sanitization
	sanitizedQuestion := s.sanitizeInput(question)
	if sanitizedQuestion == "" {
		return nil, fmt.Errorf("invalid input: empty or dangerous characters detected")
	}

	// Layer 2: Generate SQL dengan AI
	prompt := s.buildSecurePrompt(sanitizedQuestion, schema)

	req := openai.ChatCompletionRequest{
		Model: s.model,
		Messages: []openai.ChatCompletionMessage{
			{
				Role:    openai.ChatMessageRoleSystem,
				Content: s.getSystemPrompt(), // Strict instructions
			},
			{
				Role:    openai.ChatMessageRoleUser,
				Content: prompt,
			},
		},
		Temperature: 0.1, // Low temperature untuk determinism
		MaxTokens:   500, // Limit output size
	}

	resp, err := s.client.CreateChatCompletion(ctx, req)
	if err != nil {
		return nil, fmt.Errorf("AI API error: %w", err)
	}

	if len(resp.Choices) == 0 {
		return nil, fmt.Errorf("no response from AI")
	}

	// Layer 3: Extract dan clean SQL
	rawSQL := resp.Choices[0].Message.Content
	sql := s.extractSQL(rawSQL)

	if sql == "" {
		return nil, fmt.Errorf("no valid SQL generated")
	}

	// Layer 4: Security analysis (CRITICAL)
	securityResult := s.analyzeSecurity(sql)

	// Layer 5: Block jika read-only mode dan bukan SELECT
	if s.allowedReadOnly && !securityResult.IsReadOnly {
		return &GenerateSQLResult{
			SQL:              sql,
			Confidence:       0,
			RequiresApproval: true,
			IsSafeToExecute:  false,
			SecurityWarnings: append(securityResult.Warnings, "READ-ONLY MODE: Only SELECT queries allowed"),
			QueryType:        securityResult.QueryType,
			LatencyMs:        time.Since(start).Milliseconds(),
		}, nil
	}

	// Layer 6: Confidence scoring
	confidence := s.CalculateConfidence(sanitizedQuestion, sql, schema)

	// Layer 7: Generate metadata
	explanation := s.GenerateExplanation(sanitizedQuestion, sql)
	executionPlan := s.estimateExecutionPlan(sql)

	// Layer 8: Alternatives untuk low confidence
	var alternatives []string
	if confidence < 0.7 {
		alternatives = s.GenerateAlternatives(sanitizedQuestion, schema)
	}

	return &GenerateSQLResult{
		SQL:              sql,
		Confidence:       confidence,
		Explanation:      explanation,
		ExecutionPlan:    executionPlan,
		RequiresApproval: securityResult.RequiresApproval || confidence < 0.6,
		Alternatives:     alternatives,
		Provider:         s.provider,
		LatencyMs:        time.Since(start).Milliseconds(),
		IsSafeToExecute:  securityResult.IsSafe && confidence > 0.6,
		SecurityWarnings: securityResult.Warnings,
		QueryType:        securityResult.QueryType,
	}, nil
}

// GenerateSQLStreaming streams SQL generation dengan real-time security checks
func (s *AIService) GenerateSQLStreaming(ctx context.Context, question string, schema Schema) (<-chan StreamEvent, error) {
	// Pre-check: validate question
	if !s.isValidQuestion(question) {
		return nil, fmt.Errorf("question contains potentially dangerous patterns")
	}

	prompt := s.buildSecurePrompt(question, schema)

	req := openai.ChatCompletionRequest{
		Model: s.model,
		Messages: []openai.ChatCompletionMessage{
			{
				Role:    openai.ChatMessageRoleSystem,
				Content: s.getSystemPrompt(),
			},
			{
				Role:    openai.ChatMessageRoleUser,
				Content: prompt,
			},
		},
		Stream:      true,
		Temperature: 0.1,
		MaxTokens:   500,
	}

	stream, err := s.client.CreateChatCompletionStream(ctx, req)
	if err != nil {
		return nil, err
	}

	eventChan := make(chan StreamEvent)

	go func() {
		defer close(eventChan)
		defer stream.Close()

		var sqlBuilder strings.Builder
		var fullSQL string

		for {
			response, err := stream.Recv()
			if err != nil {
				eventChan <- StreamEvent{
					Type:    "error",
					Message: err.Error(),
				}
				return
			}

			if len(response.Choices) > 0 {
				content := response.Choices[0].Delta.Content
				sqlBuilder.WriteString(content)

				eventChan <- StreamEvent{
					Type:    "token",
					Content: content,
				}
			}

			// Check completion
			if response.Choices[0].FinishReason != "" {
				fullSQL = s.extractSQL(sqlBuilder.String())

				// Real-time security check
				security := s.analyzeSecurity(fullSQL)

				// Block if not safe dan read-only
				if s.allowedReadOnly && !security.IsReadOnly {
					eventChan <- StreamEvent{
						Type:    "error",
						Message: "READ-ONLY MODE: Non-SELECT queries blocked",
					}
					return
				}

				// Send confidence
				confidence := s.CalculateConfidence(question, fullSQL, schema)
				eventChan <- StreamEvent{
					Type:  "confidence",
					Score: confidence,
				}

				// Send security status
				eventChan <- StreamEvent{
					Type:             "security_check",
					RequiresApproval: security.RequiresApproval,
					IsSafe:           security.IsSafe,
					Warnings:         security.Warnings,
				}

				// Complete
				eventChan <- StreamEvent{
					Type:       "complete",
					SQL:        fullSQL,
					Confidence: confidence,
					IsSafe:     security.IsSafe,
				}
				return
			}
		}
	}()

	return eventChan, nil
}

// CalculateConfidence menghitung confidence score 0-1
func (s *AIService) CalculateConfidence(question, sql string, schema Schema) float64 {
	schemaScore := s.calculateSchemaCoverage(sql, schema)
	validityScore := s.calculateSQLValidity(sql)
	alignmentScore := s.calculateAlignment(question, sql)

	confidence := schemaScore*0.3 + validityScore*0.3 + alignmentScore*0.4

	// Penalty untuk destructive queries
	if s.isDestructiveQuery(sql) {
		confidence *= 0.7 // 30% penalty
	}

	// Clamp
	if confidence > 1 {
		confidence = 1
	}
	if confidence < 0 {
		confidence = 0
	}

	return confidence
}

// GetProvider returns provider name
func (s *AIService) GetProvider() string {
	return s.provider
}

// SetReadOnly mengubah mode read-only
func (s *AIService) SetReadOnly(readOnly bool) {
	s.allowedReadOnly = readOnly
}

// ============ SECURITY METHODS ============

// SecurityAnalysisResult hasil analisis keamanan
type SecurityAnalysisResult struct {
	IsSafe           bool
	IsReadOnly       bool
	RequiresApproval bool
	QueryType        string
	Warnings         []string
}

// analyzeSecurity multi-layer security analysis
func (s *AIService) analyzeSecurity(sql string) SecurityAnalysisResult {
	result := SecurityAnalysisResult{
		IsSafe:     true,
		IsReadOnly: true,
		Warnings:   []string{},
	}

	sqlUpper := strings.ToUpper(strings.TrimSpace(sql))

	// Detect query type
	switch {
	case strings.HasPrefix(sqlUpper, "SELECT"):
		result.QueryType = "SELECT"
	case strings.HasPrefix(sqlUpper, "INSERT"):
		result.QueryType = "INSERT"
		result.IsReadOnly = false
	case strings.HasPrefix(sqlUpper, "UPDATE"):
		result.QueryType = "UPDATE"
		result.IsReadOnly = false
	case strings.HasPrefix(sqlUpper, "DELETE"):
		result.QueryType = "DELETE"
		result.IsReadOnly = false
	case strings.HasPrefix(sqlUpper, "DROP"):
		result.QueryType = "DROP"
		result.IsReadOnly = false
	case strings.HasPrefix(sqlUpper, "TRUNCATE"):
		result.QueryType = "TRUNCATE"
		result.IsReadOnly = false
	case strings.HasPrefix(sqlUpper, "ALTER"):
		result.QueryType = "ALTER"
		result.IsReadOnly = false
	case strings.HasPrefix(sqlUpper, "CREATE"):
		result.QueryType = "CREATE"
		result.IsReadOnly = false
	default:
		result.QueryType = "UNKNOWN"
		result.IsReadOnly = false
	}

	// Check destructive patterns
	destructivePatterns := map[string]string{
		"DROP ":      "DROP statement detected - will destroy database objects",
		"TRUNCATE ":  "TRUNCATE detected - will delete all table data",
		"DELETE ":    "DELETE detected - check for WHERE clause",
		"UPDATE ":    "UPDATE detected - check for WHERE clause",
		"ALTER ":     "ALTER detected - will modify schema",
		"CREATE ":    "CREATE detected - will create new objects",
		"INSERT ":    "INSERT detected - will modify data",
		"GRANT ":     "GRANT detected - permission changes",
		"REVOKE ":    "REVOKE detected - permission changes",
		"EXEC ":      "EXEC detected - potential code execution",
		"EXECUTE ":   "EXECUTE detected - potential code execution",
		"UNION ":     "UNION detected - potential data leakage",
		"UNION ALL ": "UNION ALL detected - potential data leakage",
	}

	for pattern, warning := range destructivePatterns {
		if strings.Contains(sqlUpper, pattern) {
			result.Warnings = append(result.Warnings, warning)
			result.RequiresApproval = true

			if pattern == "DELETE " || pattern == "UPDATE " {
				// Extra check: DELETE/UPDATE tanpa WHERE
				if !strings.Contains(sqlUpper, "WHERE") {
					result.Warnings = append(result.Warnings, "CRITICAL: DELETE/UPDATE without WHERE clause")
					result.IsSafe = false
				}
			}
		}
	}

	// Check SQL injection patterns
	injectionPatterns := []string{
		`;\s*DROP\s`,
		`;\s*DELETE\s`,
		`;\s*INSERT\s`,
		`;\s*UPDATE\s`,
		`--`,
		`/\*`,
		`UNION\s+SELECT`,
		`OR\s+1\s*=\s*1`,
		`'.*OR.*'`,
		`".*OR.*"`,
	}

	for _, pattern := range injectionPatterns {
		matched, _ := regexp.MatchString(`(?i)`+pattern, sql)
		if matched {
			result.Warnings = append(result.Warnings, "Potential SQL injection pattern detected")
			result.IsSafe = false
			result.RequiresApproval = true
			break
		}
	}

	// Check for multiple statements (dangerous)
	if strings.Count(sql, ";") > 1 {
		result.Warnings = append(result.Warnings, "Multiple SQL statements detected")
		result.RequiresApproval = true
	}

	// Final safety assessment
	if !result.IsReadOnly || len(result.Warnings) > 0 {
		result.IsSafe = false
	}

	return result
}

// isDestructiveQuery quick check untuk destructive operations
func (s *AIService) isDestructiveQuery(sql string) bool {
	security := s.analyzeSecurity(sql)
	return !security.IsReadOnly || len(security.Warnings) > 0
}

// sanitizeInput membersihkan input dari dangerous characters
func (s *AIService) sanitizeInput(input string) string {
	// Remove null bytes
	input = strings.ReplaceAll(input, "\x00", "")

	// Remove control characters
	re := regexp.MustCompile(`[\x01-\x1F\x7F]`)
	input = re.ReplaceAllString(input, "")

	// Trim whitespace
	input = strings.TrimSpace(input)

	// Check for obvious injection attempts
	dangerous := []string{";", "--", "/*", "*/", "xp_", "sp_", "sysobjects"}
	for _, d := range dangerous {
		if strings.Contains(strings.ToLower(input), d) {
			// Log attempt tapi jangan block (AI bisa handle)
			// Return cleaned version
			input = strings.ReplaceAll(input, d, "")
		}
	}

	return input
}

// isValidQuestion validasi question sebelum diproses
func (s *AIService) isValidQuestion(question string) bool {
	// Block if too long (potential DoS)
	if len(question) > 1000 {
		return false
	}

	// Block if contains code execution patterns
	dangerousPatterns := []string{
		`(?i)(exec|execute)\s*\(`,
		`(?i)xp_cmdshell`,
		`(?i)sp_oamethod`,
		`(?i)sp_oacreate`,
	}

	for _, pattern := range dangerousPatterns {
		matched, _ := regexp.MatchString(pattern, question)
		if matched {
			return false
		}
	}

	return true
}

// ============ HELPER METHODS ============

func (s *AIService) getSystemPrompt() string {
	return `You are a SQL expert for DataLens BI. STRICT RULES:
1. Generate ONLY SELECT statements (read-only)
2. NEVER generate: DROP, DELETE, TRUNCATE, INSERT, UPDATE, ALTER, CREATE, GRANT
3. Use parameterized queries with ? placeholders
4. Always include reasonable LIMIT clauses (max 10000 rows)
5. Prefer explicit column names over SELECT *
6. **SEMANTIC JOIN INTEGRITY**: 
   - Prioritize UNIQUE IDENTIFIERS for joins (e.g., ID, SKU, Resi, Order_ID, Ref_No, Code).
   - Join exactly matching columns (e.g., table1.SKU = table2.SKU).
   - NEVER join on generic columns like 'status', 'date', or 'type' unless primary unique keys match first.
7. Add comments explaining complex logic
8. If unsure, return safe fallback query`
}

func (s *AIService) buildSecurePrompt(question string, schema Schema) string {
	var b strings.Builder
	b.WriteString("Database Schema (READ-ONLY ACCESS):\n")

	for _, t := range schema.Tables {
		b.WriteString(fmt.Sprintf("\nTable: %s\n", t.Name))
		for _, c := range t.Columns {
			b.WriteString(fmt.Sprintf("  - %s (%s)\n", c.Name, c.Type))
		}
	}

	b.WriteString(fmt.Sprintf("\nGenerate a safe SELECT query for: %s\n", question))
	b.WriteString("\nRequirements:\n")
	b.WriteString("- Use only SELECT statements\n")
	b.WriteString("- Add LIMIT 1000 unless aggregation\n")
	b.WriteString("- Use ? for any parameters\n")
	b.WriteString("- No subqueries in SELECT (performance)\n")

	return b.String()
}

func (s *AIService) extractSQL(raw string) string {
	// Extract SQL dari markdown code blocks jika ada
	raw = strings.TrimSpace(raw)

	// Remove markdown code blocks
	raw = strings.TrimPrefix(raw, "```sql")
	raw = strings.TrimPrefix(raw, "```SQL")
	raw = strings.TrimPrefix(raw, "```")
	raw = strings.TrimSuffix(raw, "```")
	raw = strings.TrimSpace(raw)

	// Extract first SQL statement only (security: no multiple statements)
	if idx := strings.Index(raw, ";"); idx != -1 {
		// Check if ini akhir statement atau ada statement lain
		remainder := strings.TrimSpace(raw[idx+1:])
		if remainder != "" && !strings.HasPrefix(remainder, "--") {
			// Ada statement lain, ambil yang pertama saja
			raw = raw[:idx+1]
		}
	}

	return strings.TrimSpace(raw)
}

func (s *AIService) calculateSchemaCoverage(sql string, schema Schema) float64 {
	sqlUpper := strings.ToUpper(sql)
	matches, total := 0, 0

	for _, t := range schema.Tables {
		total++
		if strings.Contains(sqlUpper, strings.ToUpper(t.Name)) {
			matches++
		}
		for _, c := range t.Columns {
			total++
			if strings.Contains(sqlUpper, strings.ToUpper(c.Name)) {
				matches++
			}
		}
	}

	if total == 0 {
		return 0.5
	}
	return float64(matches) / float64(total)
}

func (s *AIService) calculateSQLValidity(sql string) float64 {
	sqlUpper := strings.ToUpper(strings.TrimSpace(sql))

	// Must start with SELECT (read-only enforcement)
	if !strings.HasPrefix(sqlUpper, "SELECT") {
		return 0.1 // Heavy penalty untuk non-SELECT
	}

	// Check required clauses
	if !strings.Contains(sqlUpper, "FROM") {
		return 0.5
	}

	// Check for LIMIT (performance)
	if !strings.Contains(sqlUpper, "LIMIT") && !strings.Contains(sqlUpper, "GROUP BY") {
		// Warning tapi jangan penalty besar
	}

	return 0.95
}

func (s *AIService) calculateAlignment(question, sql string) float64 {
	qWords := strings.Fields(strings.ToLower(question))
	sWords := strings.Fields(strings.ToLower(sql))

	matches := 0
	for _, qw := range qWords {
		if len(qw) <= 3 {
			continue // Skip short words
		}
		for _, sw := range sWords {
			if strings.Contains(sw, qw) {
				matches++
				break
			}
		}
	}

	if len(qWords) == 0 {
		return 0.5
	}

	// Normalize
	score := float64(matches) / float64(len(qWords))
	if score > 1 {
		score = 1
	}
	return score
}

func (s *AIService) GenerateExplanation(question, sql string) string {
	sqlUpper := strings.ToUpper(sql)

	switch {
	case strings.Contains(sqlUpper, "COUNT("):
		return fmt.Sprintf("Counts records to answer: %s", question)
	case strings.Contains(sqlUpper, "SUM("):
		return fmt.Sprintf("Sums values to answer: %s", question)
	case strings.Contains(sqlUpper, "AVG("):
		return fmt.Sprintf("Calculates average to answer: %s", question)
	case strings.Contains(sqlUpper, "GROUP BY"):
		return fmt.Sprintf("Groups and aggregates data to answer: %s", question)
	case strings.Contains(sqlUpper, "JOIN"):
		return fmt.Sprintf("Joins multiple tables to answer: %s", question)
	case strings.Contains(sqlUpper, "ORDER BY"):
		return fmt.Sprintf("Sorts results to answer: %s", question)
	case strings.Contains(sqlUpper, "WHERE"):
		return fmt.Sprintf("Filters data to answer: %s", question)
	default:
		return fmt.Sprintf("Retrieves data to answer: %s", question)
	}
}

func (s *AIService) estimateExecutionPlan(sql string) string {
	sqlUpper := strings.ToUpper(sql)

	complexity := "Simple"
	reasons := []string{}

	if strings.Contains(sqlUpper, "JOIN") {
		joinCount := strings.Count(sqlUpper, "JOIN")
		if joinCount > 2 {
			complexity = "Complex"
			reasons = append(reasons, fmt.Sprintf("%d joins", joinCount))
		} else {
			complexity = "Moderate"
			reasons = append(reasons, "joins")
		}
	}

	if strings.Contains(sqlUpper, "GROUP BY") {
		complexity = "Moderate"
		reasons = append(reasons, "aggregation")
	}

	if strings.Contains(sqlUpper, "ORDER BY") {
		if len(reasons) > 0 {
			reasons = append(reasons, "sorting")
		}
	}

	if strings.Contains(sqlUpper, "SUBQUERY") || strings.Contains(sqlUpper, "WITH ") {
		complexity = "Complex"
		reasons = append(reasons, "subqueries/CTEs")
	}

	if !strings.Contains(sqlUpper, "LIMIT") && !strings.Contains(sqlUpper, "GROUP BY") {
		reasons = append(reasons, "no limit")
	}

	if len(reasons) == 0 {
		return fmt.Sprintf("Estimated: %s (single table scan)", complexity)
	}
	return fmt.Sprintf("Estimated: %s (%s)", complexity, strings.Join(reasons, ", "))
}

func (s *AIService) GenerateAlternatives(question string, schema Schema) []string {
	// Extract entity dari question
	entity := s.extractEntity(question)

	return []string{
		fmt.Sprintf("Did you mean: total %s by category?", entity),
		fmt.Sprintf("Or: %s trends over time?", entity),
		fmt.Sprintf("Or: compare %s across regions?", entity),
	}
}

func (s *AIService) extractEntity(question string) string {
	words := strings.Fields(strings.ToLower(question))
	// Skip common words
	skip := map[string]bool{"the": true, "a": true, "an": true, "show": true, "me": true, "get": true, "by": true}

	for _, w := range words {
		clean := strings.TrimFunc(w, func(r rune) bool {
			return !((r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z'))
		})
		if !skip[clean] && len(clean) > 3 {
			return clean
		}
	}
	return "data"
}

// StreamEvent untuk SSE streaming
type StreamEvent struct {
	Type             string   `json:"type"`
	Content          string   `json:"content,omitempty"`
	Score            float64  `json:"score,omitempty"`
	Message          string   `json:"message,omitempty"`
	SQL              string   `json:"sql,omitempty"`
	Confidence       float64  `json:"confidence,omitempty"`
	RequiresApproval bool     `json:"requires_approval,omitempty"`
	IsSafe           bool     `json:"is_safe,omitempty"`
	Warnings         []string `json:"warnings,omitempty"`
}

// ─────────────────────────────────────────────────────────────────────────────
// S++ Pillar 2: Causal Analysis Logic
// ─────────────────────────────────────────────────────────────────────────────

func (s *AIService) AnalyzeAnomaly(ctx context.Context, datasetID, anomalyDescription string) (string, error) {
	// Phase 5: Rate Limiting (1 per hour per dataset)
	s.mu.Lock()
	last, exists := s.analysisCooldown[datasetID]
	if exists && time.Since(last) < 1*time.Hour {
		s.mu.Unlock()
		return "Rate limited: analysis recently performed for this dataset", nil
	}
	s.analysisCooldown[datasetID] = time.Now()
	s.mu.Unlock()

	// 1. Fetch dataset metadata for forensic context
	var ds models.Dataset
	if err := s.db.WithContext(ctx).Where("id = ?", datasetID).First(&ds).Error; err != nil {
		return "", fmt.Errorf("dataset not found for anomaly analysis: %w", err)
	}

	analysisPrompt := fmt.Sprintf(`PERFORM DEEP FORENSIC CAUSAL ANALYSIS
Anomaly Description: %s
Physical Table: %s
Dataset Name: %s

Available Columns & Types:
%s

Your Goal:
1. Identify the most likely root cause based on schema relationships.
2. Suggest 2-3 FORENSIC SQL queries that would prove the hypothesis (e.g., checking for null spikes, variance shifts, or specific value correlations).
3. Draft a resolution plan.
`, anomalyDescription, ds.DataTableName, ds.Name, string(ds.Columns))

	resp, err := s.client.CreateChatCompletion(ctx, openai.ChatCompletionRequest{
		Model: s.model,
		Messages: []openai.ChatCompletionMessage{
			{Role: openai.ChatMessageRoleSystem, Content: "You are an expert Forensic Data Scientist. You excel at finding root causes in complex data schemas. You always provide verifiable SQL hypotheses."},
			{Role: openai.ChatMessageRoleUser, Content: analysisPrompt},
		},
		Temperature: 0.2,
	})
	if err != nil {
		return "", err
	}

	analysisResult := resp.Choices[0].Message.Content

	// Broadcast to all active users via WebSocket (Phase 4: Frontend Integration)
	s.hub.Broadcast("investigation_completed", map[string]any{
		"datasetId":          datasetID,
		"datasetName":        ds.Name,
		"anomalyDescription": anomalyDescription,
		"analysisResult":     analysisResult,
		"timestamp":          time.Now(),
	})

	// Send notification about the completed investigation
	// Inject dynamic tokens if possible (future enhancement)
	s.notificationSvc.SendTelegram(ctx, "", "", fmt.Sprintf("🚨 *Anomaly Investigation Complete*\n\n*Anomaly:* %s\n\n*Forensic Discovery:* %s", anomalyDescription, analysisResult))

	return analysisResult, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// S++ Pillar 3: Prescriptive Workflow Logic
// ─────────────────────────────────────────────────────────────────────────────

func (s *AIService) ExecutePrescriptiveAction(ctx context.Context, connectorID string, actionData map[string]interface{}) (interface{}, error) {
	// Phase 5: Security Hardening - Validate AI-generated payload
	if err := s.validateActionData(actionData); err != nil {
		return nil, fmt.Errorf("action data validation failed: %w", err)
	}

	var connector models.IntegrationConnector
	if err := s.db.Where("id = ?", connectorID).First(&connector).Error; err != nil {
		return nil, fmt.Errorf("connector not found: %w", err)
	}

	result, err := s.integrationSvc.ExecuteConnector(ctx, connector, actionData)
	if err != nil {
	if connector.Enabled {
		s.notificationSvc.SendTelegram(ctx, "", "", fmt.Sprintf("❌ *Action Failed*\nConnector: %s\nError: %s", connector.Name, err.Error()))
	}
		return nil, err
	}

	s.notificationSvc.SendEmail(ctx, "billing@neuradash.com", "Prescriptive Action Executed", fmt.Sprintf("Action successfully dispatched to %s.\nData: %v", connector.Name, actionData))
	
	return result, nil
}

// validateActionData ensures AI payloads don't contain forbidden patterns or risky types.
func (s *AIService) validateActionData(data map[string]interface{}) error {
	for k, v := range data {
		// Key validation: prevent header injection if keys were to be used as headers
		if len(k) > 64 || strings.ContainsAny(k, "\r\n:") {
			return fmt.Errorf("invalid key name: %s", k)
		}

		// Value validation: basic sanitization for string types
		if str, ok := v.(string); ok {
			if len(str) > 2000 {
				return fmt.Errorf("value for key %s exceeds safety limits", k)
			}
			// Check for obvious script injection attempts
			lower := strings.ToLower(str)
			if strings.Contains(lower, "<script") || strings.Contains(lower, "javascript:") {
				return fmt.Errorf("potentially malicious script detected in action value")
			}
		}
	}
	return nil
}

// SynthesizeMultiDatasetInsights performs cross-dataset reasoning.
func (s *AIService) SynthesizeMultiDatasetInsights(ctx context.Context, userID string, datasetIDs []string, query string) (string, error) {
	globalContext, err := s.BuildGlobalSchemaContext(ctx, userID)
	if err != nil {
		return "", err
	}

	analysisPrompt := fmt.Sprintf(`### GLOBAL WORKSPACE CONTEXT
%s

### User Request
%s

Goal: Synthesize insights across these DIFFERENT data sources. Find hidden correlations or cross-functional dependencies that a single-dataset analysis would miss.
`, globalContext, query)

	resp, err := s.client.CreateChatCompletion(ctx, openai.ChatCompletionRequest{
		Model: s.model,
		Messages: []openai.ChatCompletionMessage{
			{Role: openai.ChatMessageRoleSystem, Content: "You are an Elite Cross-Functional Data Architect. Your specialty is finding patterns between disconnected business silos (e.g., Marketing vs Ops vs Finance)."},
			{Role: openai.ChatMessageRoleUser, Content: analysisPrompt},
		},
	})
	if err != nil {
		return "", err
	}

	return resp.Choices[0].Message.Content, nil
}

// BuildGlobalSchemaContext constructs a metadata summary of all datasets owned by a user.
func (s *AIService) BuildGlobalSchemaContext(ctx context.Context, userID string) (string, error) {
	var datasets []models.Dataset
	if err := s.db.WithContext(ctx).Where("user_id = ?", userID).Find(&datasets).Error; err != nil {
		return "", err
	}

	if len(datasets) == 0 {
		return "No additional datasets available in workspace.", nil
	}

	var sb strings.Builder
	sb.WriteString("Available Datasets in Workspace (for Multi-Dataset Synthesis):\n")
	for _, ds := range datasets {
		sb.WriteString(fmt.Sprintf("- Table: %s (Context: %s)\n", ds.DataTableName, ds.Name))
		
		var cols []models.ColumnDef
		if err := json.Unmarshal(ds.Columns, &cols); err == nil {
			sb.WriteString("  Columns: ")
			for i, col := range cols {
				// Phase 5: Flag unique identifiers for AI join intuition
				lowerName := strings.ToLower(col.Name)
				isUnique := strings.Contains(lowerName, "id") || 
							strings.Contains(lowerName, "sku") || 
							strings.Contains(lowerName, "resi") || 
							strings.Contains(lowerName, "ref") || 
							strings.Contains(lowerName, "code")
				
				if isUnique {
					sb.WriteString(fmt.Sprintf("%s [UNIQUE KEY]", col.Name))
				} else {
					sb.WriteString(col.Name)
				}
				
				if i < len(cols)-1 {
					sb.WriteString(", ")
				}
			}
			sb.WriteString("\n")
		}
	}
	sb.WriteString("\nInstruction: If the user's request requires data not in the active dataset, refer to these workspace tables and suggest an 'Auto-Join' if appropriate.")

	return sb.String(), nil
}

// ─────────────────────────────────────────────────────────────────────────────
// S++ Pillar 4: Autonomous Data Integrity (Self-Healing)
// ─────────────────────────────────────────────────────────────────────────────

// getSenderCredentials fetches and decrypts per-user channel tokens.
func (s *AIService) getSenderCredentials(userID string) (tgToken, waInstance, waToken string) {
	if userID == "" {
		return
	}
	var cfg models.UserAIConfig
	if err := s.db.Where("user_id = ?", userID).First(&cfg).Error; err != nil {
		return
	}

	if cfg.EncryptedTelegramBotToken != "" {
		tgToken, _ = crypto.Decrypt(cfg.EncryptedTelegramBotToken, s.encryptionKey)
	}
	if cfg.EncryptedWhatsAppInstanceID != "" {
		waInstance, _ = crypto.Decrypt(cfg.EncryptedWhatsAppInstanceID, s.encryptionKey)
	}
	if cfg.EncryptedWhatsAppToken != "" {
		waToken, _ = crypto.Decrypt(cfg.EncryptedWhatsAppToken, s.encryptionKey)
	}
	return
}

// SendNotification sends a standard S++ system alert.
func (s *AIService) SendNotification(ctx context.Context, userID, subject, msg string) {
	tg, waInst, waTok := s.getSenderCredentials(userID)
	
	fullMsg := fmt.Sprintf("🤖 *S++ Intelligence System Alert*\n\n*Subject:* %s\n*Event:* %s\n\n_System operates at Grade S++ efficiency._", subject, msg)
	_ = s.notificationSvc.SendTelegram(ctx, tg, "", fullMsg)
	
	// Also attempt WhatsApp if configured
	if waInst != "" {
		_ = s.notificationSvc.SendWhatsApp(ctx, waInst, waTok, "", fullMsg)
	}
}

// SendDriftAlert sends a specialized alert when schema drift is detected.
func (s *AIService) SendDriftAlert(ctx context.Context, datasetID, driftReport string) {
	// Find owner
	var ds models.Dataset
	if err := s.db.Where("id = ?", datasetID).First(&ds).Error; err != nil {
		return
	}

	tg, waInst, waTok := s.getSenderCredentials(ds.UserID)
	fullMsg := fmt.Sprintf("🚨 *CRITICAL: SCHEMA DRIFT DETECTED*\n\n*Dataset:* %s\n\n*Forensic Analysis:*\n%s\n\n⚠️ Dashboard widgets may fail. Please re-sync metadata.", ds.Name, driftReport)
	
	_ = s.notificationSvc.SendTelegram(ctx, tg, "", fullMsg)
	if waInst != "" {
		_ = s.notificationSvc.SendWhatsApp(ctx, waInst, waTok, "", fullMsg)
	}
}

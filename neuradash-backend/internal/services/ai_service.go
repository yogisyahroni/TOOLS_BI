package services

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/sashabaranov/go-openai"
)

// AIService handles AI-powered NL2SQL generation with security safeguards
type AIService struct {
	client   *openai.Client
	model    string
	provider string
	// Security: query allowlist untuk critical operations
	allowedReadOnly bool // default true, set false untuk admin
}

// NewAIService creates a new AI service dengan security defaults
func NewAIService(apiKey string, readOnly bool) *AIService {
	return &AIService{
		client:          openai.NewClient(apiKey),
		model:           openai.GPT4TurboPreview,
		provider:        "openai",
		allowedReadOnly: readOnly, // true = hanya SELECT allowed
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
6. Add comments explaining complex logic
7. If unsure, return safe fallback query`
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

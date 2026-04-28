package handlers

import (
	"context"
	"testing"
	"github.com/stretchr/testify/assert"
	"neuradash/internal/services"
)

// MockAIService overrides real AI calls for deterministic testing
type MockAIService struct {
	services.AIService
	MockSQL string
}

func (m *MockAIService) GenerateSQL(ctx context.Context, question string, schema services.Schema) (string, error) {
	return m.MockSQL, nil
}

func (m *MockAIService) CalculateConfidence(question, sql string, schema services.Schema) float64 {
	return 0.95
}

func (m *MockAIService) GenerateExplanation(question, sql string) string {
	return "This is a mock explanation."
}

func TestNL2SQLAccuracyFlow(t *testing.T) {
	// Setup
	h := &NL2SQLHandler{} 
	
	t.Run("Safe SQL Generation Accuracy", func(t *testing.T) {
		sql := "SELECT * FROM users WHERE id = 1"
		isDestructive := h.isDestructiveQuery(sql)
		assert.False(t, isDestructive)
	})

	t.Run("Complex Join Accuracy", func(t *testing.T) {
		sql := "SELECT u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id"
		isDestructive := h.isDestructiveQuery(sql)
		assert.False(t, isDestructive)
	})
	
	t.Run("Aggressive Injection Accuracy", func(t *testing.T) {
		sql := "SELECT * FROM users; -- DROP TABLE orders"
		// Even if AI (or attacker) generates this, our handler MUST flag it for approval
		isDestructive := h.isDestructiveQuery(sql)
		assert.True(t, isDestructive)
	})
}

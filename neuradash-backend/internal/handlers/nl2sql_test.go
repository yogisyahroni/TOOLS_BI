package handlers

import (
	"testing"
	"github.com/stretchr/testify/assert"
)

func TestIsDestructiveQuery(t *testing.T) {
	h := &NL2SQLHandler{}

	tests := []struct {
		name     string
		sql      string
		expected bool
	}{
		{
			name:     "Safe Select",
			sql:      "SELECT * FROM users",
			expected: false,
		},
		{
			name:     "Simple Drop",
			sql:      "DROP TABLE users",
			expected: true,
		},
		{
			name:     "Semicolon Injection",
			sql:      "SELECT * FROM users; DROP TABLE logs",
			expected: true,
		},
		{
			name:     "Mixed Case",
			sql:      "select * from users; dRoP tAbLe logs",
			expected: true,
		},
		{
			name:     "Whitespace Trick",
			sql:      "SELECT * FROM users;   \n   DROP TABLE logs",
			expected: true,
		},
		{
			name:     "SQL Comment Bypass Attempt (Block)",
			sql:      "SELECT * FROM users /* ; DROP TABLE logs */",
			expected: true, // Semicolon found in middle of string/comment
		},
		{
			name:     "SQL Inline Comment Bypass",
			sql:      "SELECT * FROM users; -- DROP TABLE logs",
			expected: true, // Multiple statement structure detected
		},
		{
			name:     "Multiple Statements with Trailing Semicolon",
			sql:      "SELECT * FROM users; ",
			expected: false, // Trailing semicolon with nothing after it is okay
		},
		{
			name:     "Destructive Keyword in String (Safe)",
			sql:      "SELECT name FROM users WHERE status = 'DROP'",
			expected: false, // Should NOT be flagged as destructive
		},
		{
			name:     "Truncate Operation",
			sql:      "TRUNCATE TABLE active_sessions",
			expected: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := h.isDestructiveQuery(tt.sql)
			assert.Equal(t, tt.expected, result, "SQL: %s", tt.sql)
		})
	}
}

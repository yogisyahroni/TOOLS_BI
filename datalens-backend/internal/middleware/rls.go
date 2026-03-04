package middleware

import (
	"encoding/json"

	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog/log"
)

// RLSFilter holds WHERE conditions derived from RLS rules.
type RLSFilter struct {
	Column        string   `json:"column"`
	AllowedValues []string `json:"allowedValues"`
}

// RLSRepository defines the interface for fetching RLS rules.
type RLSRepository interface {
	GetRulesByDatasetAndRole(datasetID, role string) ([]RLSFilter, error)
}

// RLS injects RLS WHERE filters into the request context for dataset queries.
func RLS(repo RLSRepository) fiber.Handler {
	return func(c *fiber.Ctx) error {
		datasetID := c.Params("id") // works for /api/v1/datasets/:id/*
		if datasetID == "" {
			datasetID = c.Params("datasetId")
		}
		if datasetID == "" {
			return c.Next()
		}

		role := GetRole(c)
		if role == "admin" {
			// Admins bypass RLS
			c.Locals("rlsFilters", []RLSFilter{})
			return c.Next()
		}

		filters, err := repo.GetRulesByDatasetAndRole(datasetID, role)
		if err != nil {
			log.Warn().Err(err).Str("datasetId", datasetID).Msg("RLS rule fetch failed, allowing access")
			filters = []RLSFilter{}
		}

		c.Locals("rlsFilters", filters)
		return c.Next()
	}
}

// GetRLSFilters retrieves the injected RLS filters from context.
func GetRLSFilters(c *fiber.Ctx) []RLSFilter {
	filters, ok := c.Locals("rlsFilters").([]RLSFilter)
	if !ok {
		return nil
	}
	return filters
}

// BuildRLSWhereClause generates a SQL WHERE clause from RLS filters.
// Returns the clause string and bind parameters.
func BuildRLSWhereClause(filters []RLSFilter) (string, []interface{}) {
	if len(filters) == 0 {
		return "", nil
	}
	var clauses []string
	var args []interface{}
	for _, f := range filters {
		if len(f.AllowedValues) == 0 {
			continue
		}
		// Build IN clause: "column_name IN (?,?,?)"
		placeholders := make([]byte, 0, len(f.AllowedValues)*2-1)
		for i, v := range f.AllowedValues {
			if i > 0 {
				placeholders = append(placeholders, ',')
			}
			placeholders = append(placeholders, '?')
			args = append(args, v)
		}
		clauses = append(clauses, string([]byte(f.Column+" IN ("+string(placeholders)+")")))
	}
	if len(clauses) == 0 {
		return "", nil
	}
	where := clauses[0]
	for i := 1; i < len(clauses); i++ {
		where += " AND " + clauses[i]
	}
	return where, args
}

// ParseRLSFilters deserializes filters from a JSON byte slice.
func ParseRLSFilters(data []byte) ([]RLSFilter, error) {
	var filters []RLSFilter
	if err := json.Unmarshal(data, &filters); err != nil {
		return nil, err
	}
	return filters, nil
}

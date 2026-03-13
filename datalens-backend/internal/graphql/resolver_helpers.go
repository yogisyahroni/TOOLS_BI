package graphql

// resolver_helpers.go — Package-level helper functions used by resolvers.
//
// This file is intentionally NOT named schema_resolver.go or *_resolver.go
// so that gqlgen's code generator does not modify or move its contents.

import (
	"context"
	"fmt"
	"math"
)

// ─── Auth context ─────────────────────────────────────────────────────────────

// contextKeyType is an unexported type for context keys to avoid collisions.
type contextKeyType string

// contextUserID is the key under which the authenticated user's ID is stored
// in the request context. Set by handler.go, read by resolvers.
const contextUserID contextKeyType = "userId"

// userIDFromCtx extracts the authenticated user ID from the request context.
// Returns an error (unauthenticated) if the key is absent or empty.
func userIDFromCtx(ctx context.Context) (string, error) {
	id, _ := ctx.Value(contextUserID).(string)
	if id == "" {
		return "", fmt.Errorf("unauthenticated: missing user ID in context")
	}
	return id, nil
}

// ─── Pagination helpers ───────────────────────────────────────────────────────

// pageDefaults applies sensible defaults and bounds to pagination params.
func pageDefaults(page, limit *int) (int, int) {
	p, l := 1, 20
	if page != nil && *page > 0 {
		p = *page
	}
	if limit != nil && *limit > 0 && *limit <= 100 {
		l = *limit
	}
	return p, l
}

// buildPageInfo constructs a *PageInfo from DB total count + request params.
func buildPageInfo(total int64, page, limit int) *PageInfo {
	totalPages := int(math.Ceil(float64(total) / float64(limit)))
	if totalPages < 1 {
		totalPages = 1
	}
	return &PageInfo{
		Total:      int(total),
		Page:       page,
		Limit:      limit,
		TotalPages: totalPages,
	}
}

// ─── Widget helpers ───────────────────────────────────────────────────────────

// extractDatasetIDsFromWidgets parses the widgets JSON map and gathers any
// datasetId values referenced by dashboard widgets.
// Supports both array and object widget storage formats from the frontend.
func extractDatasetIDsFromWidgets(widgets any) []string {
	if widgets == nil {
		return nil
	}
	seen := make(map[string]struct{})
	var result []string

	collect := func(id string) {
		if id != "" {
			if _, ok := seen[id]; !ok {
				seen[id] = struct{}{}
				result = append(result, id)
			}
		}
	}

	switch v := widgets.(type) {
	case []any:
		for _, item := range v {
			if m, ok := item.(map[string]any); ok {
				if id, ok := m["datasetId"].(string); ok {
					collect(id)
				}
				if cfg, ok := m["config"].(map[string]any); ok {
					if id, ok := cfg["datasetId"].(string); ok {
						collect(id)
					}
				}
			}
		}
	case map[string]any:
		// Widgets stored as object keyed by widget ID.
		for _, wAny := range v {
			if m, ok := wAny.(map[string]any); ok {
				if id, ok := m["datasetId"].(string); ok {
					collect(id)
				}
				if cfg, ok := m["config"].(map[string]any); ok {
					if id, ok := cfg["datasetId"].(string); ok {
						collect(id)
					}
				}
			}
		}
	}
	return result
}

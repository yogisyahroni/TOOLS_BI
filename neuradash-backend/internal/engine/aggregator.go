package engine

import (
	"fmt"
	"strconv"
	"strings"

	"gorm.io/gorm"
)

// AggregateRequest defines the parameters for an aggregation query.
type AggregateRequest struct {
	DatasetID     string   `json:"datasetId"`
	DataTableName string   `json:"dataTableName"`
	Metric        string   `json:"metric"`      // column to aggregate
	Aggregation   string   `json:"aggregation"` // sum, avg, count, min, max, stdev
	GroupBy       []string `json:"groupBy"`     // columns to group by
	Filters       []Filter `json:"filters"`     // where conditions
	Limit         int      `json:"limit"`
}

// Filter is a single WHERE condition.
type Filter struct {
	Column   string      `json:"column"`
	Operator string      `json:"operator"` // eq, neq, gt, lt, gte, lte, in, like
	Value    interface{} `json:"value"`
}

// AggregateResult is a single row of aggregation output.
type AggregateResult struct {
	Groups map[string]interface{} `json:"groups"`
	Value  interface{}            `json:"value"`
}

// Aggregate runs a GROUP BY aggregation on a dynamic data table.
func Aggregate(db *gorm.DB, req AggregateRequest) ([]AggregateResult, error) {
	if req.DataTableName == "" {
		return nil, fmt.Errorf("dataTableName is required")
	}

	allowedAgg := map[string]string{
		"sum":   "SUM",
		"avg":   "AVG",
		"count": "COUNT",
		"min":   "MIN",
		"max":   "MAX",
		"stdev": "STDDEV",
	}
	aggFunc, ok := allowedAgg[strings.ToLower(req.Aggregation)]
	if !ok {
		aggFunc = "COUNT"
	}
	if req.Metric == "" {
		req.Metric = "*"
	}

	// Build SELECT clause
	selectParts := make([]string, 0, len(req.GroupBy)+1)
	for _, g := range req.GroupBy {
		selectParts = append(selectParts, fmt.Sprintf(`"%s"`, sanitizeCol(g)))
	}
	if req.Metric == "*" {
		selectParts = append(selectParts, fmt.Sprintf(`%s(*) AS "value"`, aggFunc))
	} else {
		selectParts = append(selectParts, fmt.Sprintf(`%s("%s") AS "value"`, aggFunc, sanitizeCol(req.Metric)))
	}

	// Build GROUP BY clause
	groupByParts := make([]string, len(req.GroupBy))
	for i, g := range req.GroupBy {
		groupByParts[i] = fmt.Sprintf(`"%s"`, sanitizeCol(g))
	}

	// Build WHERE clause from filters
	whereClause, args := buildWhereClause(req.Filters)

	sql := fmt.Sprintf(`SELECT %s FROM "%s"`, strings.Join(selectParts, ", "), req.DataTableName)
	if whereClause != "" {
		sql += " WHERE " + whereClause
	}
	if len(groupByParts) > 0 {
		sql += " GROUP BY " + strings.Join(groupByParts, ", ")
		sql += " ORDER BY " + strings.Join(groupByParts, ", ")
	}
	if req.Limit > 0 {
		sql += fmt.Sprintf(" LIMIT %d", req.Limit)
	}

	var rawRows []map[string]interface{}
	if err := db.Raw(sql, args...).Find(&rawRows).Error; err != nil {
		return nil, fmt.Errorf("aggregate query failed: %w", err)
	}

	results := make([]AggregateResult, len(rawRows))
	for i, row := range rawRows {
		result := AggregateResult{Groups: make(map[string]interface{})}
		for _, g := range req.GroupBy {
			result.Groups[g] = row[g]
		}
		result.Value = row["value"]
		results[i] = result
	}

	return results, nil
}

// buildWhereClause converts Filter slice to a SQL WHERE clause with args.
func buildWhereClause(filters []Filter) (string, []interface{}) {
	if len(filters) == 0 {
		return "", nil
	}

	var parts []string
	var args []interface{}

	for _, f := range filters {
		col := fmt.Sprintf(`"%s"`, sanitizeCol(f.Column))
		switch strings.ToLower(f.Operator) {
		case "eq", "=":
			parts = append(parts, col+" = ?")
			args = append(args, f.Value)
		case "neq", "!=", "<>":
			parts = append(parts, col+" != ?")
			args = append(args, f.Value)
		case "gt", ">":
			parts = append(parts, col+" > ?")
			args = append(args, f.Value)
		case "lt", "<":
			parts = append(parts, col+" < ?")
			args = append(args, f.Value)
		case "gte", ">=":
			parts = append(parts, col+" >= ?")
			args = append(args, f.Value)
		case "lte", "<=":
			parts = append(parts, col+" <= ?")
			args = append(args, f.Value)
		case "like":
			parts = append(parts, col+` ILIKE ?`)
			args = append(args, "%"+fmt.Sprintf("%v", f.Value)+"%")
		case "in":
			vals, ok := f.Value.([]interface{})
			if !ok {
				continue
			}
			placeholders := make([]string, len(vals))
			for j, v := range vals {
				placeholders[j] = "?"
				args = append(args, v)
			}
			parts = append(parts, col+" IN ("+strings.Join(placeholders, ",")+")")
		}
	}

	return strings.Join(parts, " AND "), args
}

func sanitizeCol(s string) string {
	var result strings.Builder
	for _, r := range s {
		if r == '"' || r == '\'' || r == ';' {
			continue
		}
		result.WriteRune(r)
	}
	return result.String()
}

// PivotRequest defines the parameters for a pivot table computation.
type PivotRequest struct {
	DataTableName string   `json:"dataTableName"`
	RowField      string   `json:"rowField"`
	ColField      string   `json:"colField"`
	ValueField    string   `json:"valueField"`
	Aggregation   string   `json:"aggregation"` // sum, avg, count
	Filters       []Filter `json:"filters"`
}

// PivotResult is the pivot table output.
type PivotResult struct {
	RowValues []interface{}                     `json:"rowValues"`
	ColValues []interface{}                     `json:"colValues"`
	Cells     map[string]map[string]interface{} `json:"cells"` // row → col → value
}

// Pivot computes a pivot table from a dataset table.
func Pivot(db *gorm.DB, req PivotRequest) (*PivotResult, error) {
	allowedAgg := map[string]string{
		"sum": "SUM", "avg": "AVG", "count": "COUNT", "min": "MIN", "max": "MAX",
	}
	aggFunc := allowedAgg[strings.ToLower(req.Aggregation)]
	if aggFunc == "" {
		aggFunc = "COUNT"
	}

	rowCol := sanitizeCol(req.RowField)
	colCol := sanitizeCol(req.ColField)
	valCol := sanitizeCol(req.ValueField)

	whereClause, args := buildWhereClause(req.Filters)
	sql := fmt.Sprintf(`SELECT "%s", "%s", %s("%s") AS "agg_val" FROM "%s"`,
		rowCol, colCol, aggFunc, valCol, req.DataTableName)
	if whereClause != "" {
		sql += " WHERE " + whereClause
	}
	sql += fmt.Sprintf(` GROUP BY "%s", "%s" ORDER BY "%s", "%s"`, rowCol, colCol, rowCol, colCol)

	var rawRows []map[string]interface{}
	if err := db.Raw(sql, args...).Find(&rawRows).Error; err != nil {
		return nil, fmt.Errorf("pivot query failed: %w", err)
	}

	result := &PivotResult{
		Cells: make(map[string]map[string]interface{}),
	}

	rowSet := map[string]bool{}
	colSet := map[string]bool{}

	for _, row := range rawRows {
		rv := fmt.Sprintf("%v", row[rowCol])
		cv := fmt.Sprintf("%v", row[colCol])
		val := row["agg_val"]

		rowSet[rv] = true
		colSet[cv] = true

		if result.Cells[rv] == nil {
			result.Cells[rv] = make(map[string]interface{})
		}
		result.Cells[rv][cv] = val
	}

	for rv := range rowSet {
		result.RowValues = append(result.RowValues, rv)
	}
	for cv := range colSet {
		result.ColValues = append(result.ColValues, cv)
	}

	return result, nil
}

// CrossFilterRequest computes data filtered by a selection on another field.
type CrossFilterRequest struct {
	DataTableName string   `json:"dataTableName"`
	TargetColumn  string   `json:"targetColumn"`
	Aggregation   string   `json:"aggregation"`
	ActiveFilters []Filter `json:"activeFilters"` // from other charts/widgets
}

// CrossFilter returns aggregated data with cross-filter conditions applied.
func CrossFilter(db *gorm.DB, req CrossFilterRequest) ([]AggregateResult, error) {
	return Aggregate(db, AggregateRequest{
		DataTableName: req.DataTableName,
		Metric:        req.TargetColumn,
		Aggregation:   req.Aggregation,
		GroupBy:       []string{req.TargetColumn},
		Filters:       req.ActiveFilters,
		Limit:         500,
	})
}

// parseFloat safely converts interface{} to float64.
func parseFloat(v interface{}) (float64, bool) {
	switch val := v.(type) {
	case float64:
		return val, true
	case int64:
		return float64(val), true
	case string:
		f, err := strconv.ParseFloat(val, 64)
		return f, err == nil
	}
	return 0, false
}

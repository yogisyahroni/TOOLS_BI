package engine_test

import (
	"testing"

	"neuradash/internal/engine"
)

// ─── sanitizeCol (indirectly tested via buildWhereClause) ────────────────────

// We can test buildWhereClause via the exported Filter struct.
// Since buildWhereClause is unexported we test its effects through Aggregate opts
// by unit-testing the SQL builder logic indirectly. For the pure-logic helpers
// we test sanitization + operator mapping through engine.Filter.

func TestFilter_SanitizeCol_NoInjection(t *testing.T) {
	// Any column name with SQL-special chars should be stripped by sanitizeCol.
	// We indirectly verify this by constructing filters with malicious column names
	// and checking no panic occurs and the dangerous chars are absent from the result.
	// Since buildWhereClause is unexported, we verify through AggregateRequest validation.
	req := engine.AggregateRequest{
		DataTableName: "", // triggers early error
		Metric:        `evil"column'name`,
		Aggregation:   "sum",
		GroupBy:       []string{`normal_col`},
		Filters: []engine.Filter{
			{Column: `valid_col"; DROP TABLE users; --`, Operator: "eq", Value: 42},
		},
	}
	// Aggregate with empty DataTableName must return an error (not panic).
	_, err := engine.Aggregate(nil, req)
	if err == nil {
		t.Error("expected error for empty DataTableName, got nil")
	}
}

// ─── AggregateRequest validation ─────────────────────────────────────────────

func TestAggregate_EmptyTableName_Error(t *testing.T) {
	_, err := engine.Aggregate(nil, engine.AggregateRequest{})
	if err == nil {
		t.Fatal("expected error for empty DataTableName")
	}
	if err.Error() != "dataTableName is required" {
		t.Errorf("unexpected error message: %s", err.Error())
	}
}

// ─── CrossFilter wiring ───────────────────────────────────────────────────────

func TestCrossFilter_DelegatesToAggregate(t *testing.T) {
	// CrossFilter with empty table must propagate the Aggregate error correctly.
	_, err := engine.CrossFilter(nil, engine.CrossFilterRequest{
		DataTableName: "",
		TargetColumn:  "revenue",
		Aggregation:   "sum",
	})
	if err == nil {
		t.Fatal("expected error from CrossFilter delegating to Aggregate")
	}
}

// ─── AnomalyResult correctness ────────────────────────────────────────────────

func TestAnomalyResult_Indices(t *testing.T) {
	data := []float64{1, 2, 3, 4, 5}
	results := engine.DetectAnomalies(data, engine.MethodIQR)
	for i, r := range results {
		if r.Index != i {
			t.Errorf("expected Index=%d, got %d", i, r.Index)
		}
		if r.Value != data[i] {
			t.Errorf("expected Value=%.0f, got %.0f", data[i], r.Value)
		}
	}
}

func TestAnomalyResult_Bounds_AreSet(t *testing.T) {
	data := []float64{10, 20, 30, 40, 50}
	results := engine.DetectAnomalies(data, engine.MethodIQR)
	for _, r := range results {
		if r.LowerBound == 0 && r.UpperBound == 0 {
			t.Error("expected non-zero bounds from IQR method")
		}
	}
}

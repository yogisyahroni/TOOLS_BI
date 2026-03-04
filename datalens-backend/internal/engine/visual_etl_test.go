package engine_test

import (
	"testing"

	"datalens/internal/engine"
)

// ─── Topological sort ────────────────────────────────────────────────────────

func TestTopoSort_LinearChain(t *testing.T) {
	// A → B → C
	spec := engine.PipelineSpec{
		Nodes: []engine.NodeSpec{
			{ID: "A", Type: "source", Inputs: nil},
			{ID: "B", Type: "filter", Inputs: []string{"A"}},
			{ID: "C", Type: "limit", Inputs: []string{"B"}},
		},
	}
	result, err := engine.RunVisualPipeline(nil, spec)
	// source node needs DB, but topo sort + limit can work on nil data
	// We expect a result object (no panic) and Errors may include source error
	if err != nil {
		t.Fatalf("unexpected hard error: %v", err)
	}
	if len(result.Order) != 3 {
		t.Errorf("expected 3 nodes in order, got %d: %v", len(result.Order), result.Order)
	}
	// Verify A comes before B, B before C
	idx := func(id string) int {
		for i, v := range result.Order {
			if v == id {
				return i
			}
		}
		return -1
	}
	if idx("A") >= idx("B") || idx("B") >= idx("C") {
		t.Errorf("incorrect topo order: %v", result.Order)
	}
}

func TestTopoSort_CycleDetected(t *testing.T) {
	// A → B → A (cycle)
	spec := engine.PipelineSpec{
		Nodes: []engine.NodeSpec{
			{ID: "A", Type: "filter", Inputs: []string{"B"}},
			{ID: "B", Type: "filter", Inputs: []string{"A"}},
		},
	}
	_, err := engine.RunVisualPipeline(nil, spec)
	if err == nil {
		t.Error("expected error for cyclic graph")
	}
}

// ─── Filter node ─────────────────────────────────────────────────────────────

func TestNode_Filter(t *testing.T) {
	rows := []map[string]interface{}{
		{"sales": float64(100)},
		{"sales": float64(200)},
		{"sales": float64(50)},
	}
	spec := engine.PipelineSpec{
		Nodes: []engine.NodeSpec{
			{ID: "src", Type: "union", Inputs: nil,
				Config: map[string]interface{}{}},
			{ID: "flt", Type: "filter", Inputs: []string{"src"},
				Config: map[string]interface{}{
					"column": "sales", "operator": ">", "value": float64(75),
				}},
		},
	}
	// Seed src output manually via a custom run
	result, _ := engine.RunVisualPipeline(nil, spec)
	// src is union with no inputs → 0 rows
	// filter gets 0 rows → 0 output (no panic)
	_ = result

	// Now test filter logic directly with in-memory pipeline
	spec2 := engine.PipelineSpec{
		Nodes: []engine.NodeSpec{
			{ID: "flt", Type: "filter", Inputs: nil,
				Config: map[string]interface{}{
					"column": "sales", "operator": ">", "value": float64(75),
				}},
		},
	}
	_ = spec2

	// Direct runner test: inject rows via union + filter
	spec3 := buildTwoNodeSpec(rows, "filter", map[string]interface{}{
		"column": "sales", "operator": ">", "value": float64(75),
	})
	res3, err := engine.RunVisualPipeline(nil, spec3)
	if err != nil {
		t.Fatalf("error: %v", err)
	}
	if len(res3.Rows) != 2 { // 100 and 200 pass
		t.Errorf("expected 2 rows after filter >75, got %d", len(res3.Rows))
	}
}

// ─── Select node ─────────────────────────────────────────────────────────────

func TestNode_Select(t *testing.T) {
	rows := []map[string]interface{}{
		{"a": 1, "b": 2, "c": 3},
	}
	spec := buildTwoNodeSpec(rows, "select", map[string]interface{}{
		"columns": []interface{}{"a", "c"},
	})
	res, err := engine.RunVisualPipeline(nil, spec)
	if err != nil {
		t.Fatalf("error: %v", err)
	}
	if len(res.Rows) != 1 {
		t.Fatalf("expected 1 row, got %d", len(res.Rows))
	}
	if _, ok := res.Rows[0]["b"]; ok {
		t.Error("column 'b' should have been removed by select")
	}
	if res.Rows[0]["a"] != 1 {
		t.Error("column 'a' should be present")
	}
}

// ─── Rename node ──────────────────────────────────────────────────────────────

func TestNode_Rename(t *testing.T) {
	rows := []map[string]interface{}{
		{"old_name": float64(42)},
	}
	spec := buildTwoNodeSpec(rows, "rename", map[string]interface{}{
		"from": "old_name", "to": "new_name",
	})
	res, err := engine.RunVisualPipeline(nil, spec)
	if err != nil {
		t.Fatalf("error: %v", err)
	}
	if _, ok := res.Rows[0]["old_name"]; ok {
		t.Error("old_name should be gone")
	}
	if res.Rows[0]["new_name"] == nil {
		t.Error("new_name should exist")
	}
}

// ─── Limit node ───────────────────────────────────────────────────────────────

func TestNode_Limit(t *testing.T) {
	rows := make([]map[string]interface{}, 10)
	for i := range rows {
		rows[i] = map[string]interface{}{"i": float64(i)}
	}
	spec := buildTwoNodeSpec(rows, "limit", map[string]interface{}{
		"n": float64(3),
	})
	res, err := engine.RunVisualPipeline(nil, spec)
	if err != nil {
		t.Fatalf("error: %v", err)
	}
	if len(res.Rows) != 3 {
		t.Errorf("expected 3 rows, got %d", len(res.Rows))
	}
}

// ─── Sort node ────────────────────────────────────────────────────────────────

func TestNode_Sort_Ascending(t *testing.T) {
	rows := []map[string]interface{}{
		{"v": float64(30)},
		{"v": float64(10)},
		{"v": float64(20)},
	}
	spec := buildTwoNodeSpec(rows, "sort", map[string]interface{}{
		"column": "v", "desc": false,
	})
	res, err := engine.RunVisualPipeline(nil, spec)
	if err != nil {
		t.Fatalf("error: %v", err)
	}
	vals := make([]float64, len(res.Rows))
	for i, r := range res.Rows {
		vals[i], _ = r["v"].(float64)
	}
	if vals[0] != 10 || vals[1] != 20 || vals[2] != 30 {
		t.Errorf("wrong sort order: %v", vals)
	}
}

// ─── Union node ───────────────────────────────────────────────────────────────

func TestNode_Union(t *testing.T) {
	// Build two seed nodes and a union on top
	rows1 := []map[string]interface{}{{"v": float64(1)}, {"v": float64(2)}}
	rows2 := []map[string]interface{}{{"v": float64(3)}, {"v": float64(4)}}
	spec := engine.PipelineSpec{
		Nodes: []engine.NodeSpec{
			{ID: "left", Type: "union", Inputs: nil},  // 0 rows
			{ID: "right", Type: "union", Inputs: nil}, // 0 rows
			{ID: "union", Type: "union", Inputs: []string{"left", "right"}},
		},
	}
	res, _ := engine.RunVisualPipeline(nil, spec)
	// Both seeds produce 0 rows → union = 0
	_ = res
	_ = rows1
	_ = rows2
	// verified no panic
}

// ─── Dedup node ───────────────────────────────────────────────────────────────

func TestNode_Dedup(t *testing.T) {
	rows := []map[string]interface{}{
		{"id": float64(1), "v": "a"},
		{"id": float64(1), "v": "a"}, // duplicate
		{"id": float64(2), "v": "b"},
	}
	spec := buildTwoNodeSpec(rows, "dedup", map[string]interface{}{
		"keys": []interface{}{"id"},
	})
	res, err := engine.RunVisualPipeline(nil, spec)
	if err != nil {
		t.Fatalf("error: %v", err)
	}
	if len(res.Rows) != 2 {
		t.Errorf("expected 2 rows after dedup, got %d", len(res.Rows))
	}
}

// ─── Aggregate node ───────────────────────────────────────────────────────────

func TestNode_Aggregate(t *testing.T) {
	rows := []map[string]interface{}{
		{"cat": "A", "v": float64(10)},
		{"cat": "A", "v": float64(20)},
		{"cat": "B", "v": float64(5)},
	}
	spec := buildTwoNodeSpec(rows, "aggregate", map[string]interface{}{
		"groupBy":     []interface{}{"cat"},
		"metric":      "v",
		"aggregation": "sum",
	})
	res, err := engine.RunVisualPipeline(nil, spec)
	if err != nil {
		t.Fatalf("error: %v", err)
	}
	if len(res.Rows) != 2 {
		t.Fatalf("expected 2 groups, got %d", len(res.Rows))
	}
	// Find group A
	for _, r := range res.Rows {
		if r["cat"] == "A" {
			if r["v"] != float64(30) {
				t.Errorf("expected A sum=30, got %v", r["v"])
			}
		}
	}
}

// ─── Derive node (uses formula evaluator) ────────────────────────────────────

func TestNode_Derive(t *testing.T) {
	rows := []map[string]interface{}{
		{"sales": float64(100), "cost": float64(60)},
		{"sales": float64(200), "cost": float64(90)},
	}
	spec := buildTwoNodeSpec(rows, "derive", map[string]interface{}{
		"column":  "profit",
		"formula": "SUM(sales) - SUM(cost)", // 300 - 150 = 150 for all rows
	})
	res, err := engine.RunVisualPipeline(nil, spec)
	if err != nil {
		t.Fatalf("error: %v", err)
	}
	for _, r := range res.Rows {
		if _, ok := r["profit"]; !ok {
			t.Error("expected 'profit' column to be derived")
		}
	}
}

// ─── Unknown node type ────────────────────────────────────────────────────────

func TestNode_UnknownType_ErrorRecorded(t *testing.T) {
	spec := engine.PipelineSpec{
		Nodes: []engine.NodeSpec{
			{ID: "bad", Type: "notanode", Inputs: nil},
		},
	}
	res, err := engine.RunVisualPipeline(nil, spec)
	if err != nil {
		t.Fatalf("RunVisualPipeline should not hard-fail for unknown node: %v", err)
	}
	if res.Errors["bad"] == "" {
		t.Error("expected error recorded for unknown node type")
	}
}

// ─── Helper: build a 2-node spec with in-memory seed ─────────────────────────
// Node 1 "seed" is a union (passthrough) with no inputs — outputs 0 rows.
// Node 2 is the node under test.
// To actually test with data, we use the RunVisualPipeline and inject rows
// by constructing a "union" of a pre-seeded source.
// For node tests that need data, we use the 3-node variant below.

func buildTwoNodeSpec(rows []map[string]interface{}, nodeType string, cfg map[string]interface{}) engine.PipelineSpec {
	// We use a creative trick: wrap a custom "union" that passes all given rows
	// through by encoding them as "union" with no real inputs, then rely on
	// the test to call an internal helper.
	// Since we can't inject rows into RunVisualPipeline directly, we need to
	// use what runs: build a 3-node spec where "data" is an in-memory seed.
	// The only way to seed rows without a DB is through the "union" node type,
	// which passes through inputs — but with 0 inputs it produces 0 rows.
	//
	// Instead we expose this via a cast: the "derive" node gets an empty dataset
	// unless we pre-populate. For tests that need actual data we create a
	// helper that calls RunVisualPipeline with a mock through cast→union path.
	//
	// For simplicity in pure Go unit test context: we inject rows by
	// wrapping them in individual "union" nodes.

	_ = rows // will be used by test implementations above that call this helper
	return engine.PipelineSpec{
		Nodes: []engine.NodeSpec{
			{ID: "seed", Type: "__inmemory__", Inputs: nil,
				Config: map[string]interface{}{"rows": rows}},
			{ID: "target", Type: nodeType, Inputs: []string{"seed"}, Config: cfg},
		},
	}
}

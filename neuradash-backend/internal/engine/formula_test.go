package engine_test

import (
	"math"
	"testing"

	"datalens/internal/engine"
)

// helper: rows for testing
func testRows() []map[string]interface{} {
	return []map[string]interface{}{
		{"product": "A", "sales": float64(100), "cost": float64(60)},
		{"product": "B", "sales": float64(200), "cost": float64(90)},
		{"product": "C", "sales": float64(150), "cost": float64(80)},
		{"product": "A", "sales": float64(50), "cost": float64(30)},
		{"product": "B", "sales": float64(300), "cost": float64(120)},
	}
}

// ─── Basic arithmetic ─────────────────────────────────────────────────────────

func TestEvaluate_NumberLiteral(t *testing.T) {
	v, err := engine.Evaluate("42", engine.FormulaContext{})
	assertNoErr(t, err)
	assertFloat(t, 42, v)
}

func TestEvaluate_AddSubtract(t *testing.T) {
	v, err := engine.Evaluate("10 + 5 - 3", engine.FormulaContext{})
	assertNoErr(t, err)
	assertFloat(t, 12, v)
}

func TestEvaluate_MultiplyDivide(t *testing.T) {
	v, err := engine.Evaluate("4 * 5 / 2", engine.FormulaContext{})
	assertNoErr(t, err)
	assertFloat(t, 10, v)
}

func TestEvaluate_DivideByZero_ReturnsZero(t *testing.T) {
	v, err := engine.Evaluate("10 / 0", engine.FormulaContext{})
	assertNoErr(t, err)
	assertFloat(t, 0, v)
}

// ─── SUM / AVERAGE / COUNT ────────────────────────────────────────────────────

func TestEvaluate_SUM(t *testing.T) {
	ctx := engine.FormulaContext{Rows: testRows()}
	v, err := engine.Evaluate("SUM(sales)", ctx)
	assertNoErr(t, err)
	assertFloat(t, 800, v) // 100+200+150+50+300
}

func TestEvaluate_AVERAGE(t *testing.T) {
	ctx := engine.FormulaContext{Rows: testRows()}
	v, err := engine.Evaluate("AVERAGE(sales)", ctx)
	assertNoErr(t, err)
	assertFloat(t, 160, v) // 800/5
}

func TestEvaluate_COUNT(t *testing.T) {
	ctx := engine.FormulaContext{Rows: testRows()}
	v, err := engine.Evaluate("COUNT(sales)", ctx)
	assertNoErr(t, err)
	assertFloat(t, 5, v)
}

// ─── MIN / MAX ────────────────────────────────────────────────────────────────

func TestEvaluate_MIN(t *testing.T) {
	ctx := engine.FormulaContext{Rows: testRows()}
	v, err := engine.Evaluate("MIN(sales)", ctx)
	assertNoErr(t, err)
	assertFloat(t, 50, v)
}

func TestEvaluate_MAX(t *testing.T) {
	ctx := engine.FormulaContext{Rows: testRows()}
	v, err := engine.Evaluate("MAX(sales)", ctx)
	assertNoErr(t, err)
	assertFloat(t, 300, v)
}

// ─── DISTINCTCOUNT ───────────────────────────────────────────────────────────

func TestEvaluate_DISTINCTCOUNT(t *testing.T) {
	ctx := engine.FormulaContext{Rows: testRows()}
	v, err := engine.Evaluate("DISTINCTCOUNT(product)", ctx)
	assertNoErr(t, err)
	assertFloat(t, 3, v) // A, B, C
}

// ─── IF / AND / OR / NOT ─────────────────────────────────────────────────────

func TestEvaluate_IF_True(t *testing.T) {
	v, err := engine.Evaluate("IF(1, 100, 0)", engine.FormulaContext{})
	assertNoErr(t, err)
	assertFloat(t, 100, v)
}

func TestEvaluate_IF_False(t *testing.T) {
	v, err := engine.Evaluate("IF(0, 100, 999)", engine.FormulaContext{})
	assertNoErr(t, err)
	assertFloat(t, 999, v)
}

func TestEvaluate_AND_True(t *testing.T) {
	v, err := engine.Evaluate("AND(1, 1)", engine.FormulaContext{})
	assertNoErr(t, err)
	assertFloat(t, 1, v)
}

func TestEvaluate_AND_False(t *testing.T) {
	v, err := engine.Evaluate("AND(1, 0)", engine.FormulaContext{})
	assertNoErr(t, err)
	assertFloat(t, 0, v)
}

func TestEvaluate_OR_True(t *testing.T) {
	v, err := engine.Evaluate("OR(0, 1)", engine.FormulaContext{})
	assertNoErr(t, err)
	assertFloat(t, 1, v)
}

func TestEvaluate_NOT_True(t *testing.T) {
	v, err := engine.Evaluate("NOT(0)", engine.FormulaContext{})
	assertNoErr(t, err)
	assertFloat(t, 1, v)
}

// ─── ROUND / ABS ─────────────────────────────────────────────────────────────

func TestEvaluate_ROUND(t *testing.T) {
	v, err := engine.Evaluate("ROUND(3.14159, 2)", engine.FormulaContext{})
	assertNoErr(t, err)
	f, _ := v.(float64)
	if math.Abs(f-3.14) > 0.001 {
		t.Errorf("expected ~3.14, got %v", f)
	}
}

func TestEvaluate_ABS_Negative(t *testing.T) {
	v, err := engine.Evaluate("ABS(-42)", engine.FormulaContext{})
	assertNoErr(t, err)
	assertFloat(t, 42, v)
}

// ─── DIVIDE ───────────────────────────────────────────────────────────────────

func TestEvaluate_DIVIDE_Safe(t *testing.T) {
	v, err := engine.Evaluate("DIVIDE(10, 2)", engine.FormulaContext{})
	assertNoErr(t, err)
	assertFloat(t, 5, v)
}

func TestEvaluate_DIVIDE_ByZero_Fallback(t *testing.T) {
	v, err := engine.Evaluate("DIVIDE(10, 0, -1)", engine.FormulaContext{})
	assertNoErr(t, err)
	assertFloat(t, -1, v)
}

// ─── VAR / STDEV ─────────────────────────────────────────────────────────────

func TestEvaluate_VAR(t *testing.T) {
	ctx := engine.FormulaContext{Rows: testRows()}
	v, err := engine.Evaluate("VAR(sales)", ctx)
	assertNoErr(t, err)
	f, _ := v.(float64)
	if f <= 0 {
		t.Errorf("expected positive variance, got %v", f)
	}
}

func TestEvaluate_STDEV(t *testing.T) {
	ctx := engine.FormulaContext{Rows: testRows()}
	v, err := engine.Evaluate("STDEV(sales)", ctx)
	assertNoErr(t, err)
	f, _ := v.(float64)
	if f <= 0 {
		t.Errorf("expected positive stddev, got %v", f)
	}
}

// ─── SWITCH ───────────────────────────────────────────────────────────────────

func TestEvaluate_SWITCH_Match(t *testing.T) {
	v, err := engine.Evaluate(`SWITCH("b", "a", 1, "b", 2, "c", 3)`, engine.FormulaContext{})
	assertNoErr(t, err)
	assertFloat(t, 2, v)
}

func TestEvaluate_SWITCH_Else(t *testing.T) {
	v, err := engine.Evaluate(`SWITCH("z", "a", 1, "b", 2, 99)`, engine.FormulaContext{})
	assertNoErr(t, err)
	assertFloat(t, 99, v)
}

// ─── COALESCE ─────────────────────────────────────────────────────────────────

func TestEvaluate_COALESCE(t *testing.T) {
	v, err := engine.Evaluate("COALESCE(0, 0, 42)", engine.FormulaContext{})
	assertNoErr(t, err)
	assertFloat(t, 42, v)
}

// ─── SUMIF / COUNTIF ─────────────────────────────────────────────────────────

func TestEvaluate_SUMIF(t *testing.T) {
	ctx := engine.FormulaContext{Rows: testRows()}
	v, err := engine.Evaluate(`SUMIF(sales, ">", 100)`, ctx)
	assertNoErr(t, err)
	assertFloat(t, 650, v) // 200+150+300
}

func TestEvaluate_COUNTIF(t *testing.T) {
	ctx := engine.FormulaContext{Rows: testRows()}
	v, err := engine.Evaluate(`COUNTIF(sales, ">=", 150)`, ctx)
	assertNoErr(t, err)
	assertFloat(t, 3, v) // 200, 150, 300
}

// ─── Composed formula ─────────────────────────────────────────────────────────

func TestEvaluate_ComposedFormula(t *testing.T) {
	ctx := engine.FormulaContext{Rows: testRows()}
	// (SUM(sales) - SUM(cost)) / SUM(sales) = (800-380)/800 = 0.525
	v, err := engine.Evaluate("(SUM(sales) - SUM(cost)) / SUM(sales)", ctx)
	assertNoErr(t, err)
	f, _ := v.(float64)
	if math.Abs(f-0.525) > 0.001 {
		t.Errorf("expected ~0.525, got %v", f)
	}
}

// ─── Error cases ──────────────────────────────────────────────────────────────

func TestEvaluate_EmptyFormula_Error(t *testing.T) {
	_, err := engine.Evaluate("", engine.FormulaContext{})
	if err == nil {
		t.Error("expected error for empty formula")
	}
}

func TestEvaluate_UnknownFunction_Error(t *testing.T) {
	_, err := engine.Evaluate("FOOBAR(x)", engine.FormulaContext{})
	if err == nil {
		t.Error("expected error for unknown function FOOBAR")
	}
}

// ─── Test helpers ─────────────────────────────────────────────────────────────

func assertNoErr(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func assertFloat(t *testing.T, expected float64, got interface{}) {
	t.Helper()
	f, ok := got.(float64)
	if !ok {
		t.Fatalf("expected float64, got %T (%v)", got, got)
	}
	if math.Abs(f-expected) > 0.001 {
		t.Errorf("expected %.4f, got %.4f", expected, f)
	}
}

package engine_test

import (
	"testing"

	"datalens/internal/engine"
)

// ─── IQR anomaly tests ────────────────────────────────────────────────────────

func TestDetectAnomalies_IQR_NoOutliers(t *testing.T) {
	// Uniform data — no outliers expected
	data := []float64{10, 12, 11, 13, 10, 12, 11, 13, 11, 12}
	results := engine.DetectAnomalies(data, engine.MethodIQR)

	if len(results) != len(data) {
		t.Fatalf("expected %d results, got %d", len(data), len(results))
	}
	for _, r := range results {
		if r.IsAnomaly {
			t.Errorf("expected no anomaly at index %d (value=%.2f)", r.Index, r.Value)
		}
	}
}

func TestDetectAnomalies_IQR_DetectsOutlier(t *testing.T) {
	// 30 clustered values + one extreme outlier — IQR will flag the outlier
	data := make([]float64, 30)
	for i := range data {
		data[i] = float64(10 + i%5) // values 10..14, tightly clustered
	}
	data = append(data, 1_000_000) // extreme outlier

	results := engine.DetectAnomalies(data, engine.MethodIQR)
	if len(results) != len(data) {
		t.Fatalf("expected %d results, got %d", len(data), len(results))
	}
	last := results[len(results)-1]
	if !last.IsAnomaly {
		t.Errorf("expected 1_000_000 to be IQR anomaly; bounds=[%.2f, %.2f]",
			last.LowerBound, last.UpperBound)
	}
}

func TestDetectAnomalies_IQR_Empty(t *testing.T) {
	results := engine.DetectAnomalies(nil, engine.MethodIQR)
	if len(results) != 0 {
		t.Errorf("expected empty results for nil input, got %d", len(results))
	}
}

// ─── Z-score anomaly tests ────────────────────────────────────────────────────

func TestDetectAnomalies_ZScore_DetectsOutlier(t *testing.T) {
	// 50 values clustered near 100, plus one extreme outlier at 1e9
	// This guarantees |z| >> 3 for the outlier
	data := make([]float64, 50)
	for i := range data {
		data[i] = 100.0 + float64(i%5) // 100..104
	}
	data = append(data, 1_000_000_000) // extreme outlier, z >> 3

	results := engine.DetectAnomalies(data, engine.MethodZScore)
	last := results[len(results)-1]
	if !last.IsAnomaly {
		t.Errorf("expected 1e9 to be Z-score anomaly, got score=%.4f", last.Score)
	}
}

func TestDetectAnomalies_ZScore_AllSameValues(t *testing.T) {
	// All same — stddev=0, none should be anomaly
	data := []float64{5, 5, 5, 5, 5}
	results := engine.DetectAnomalies(data, engine.MethodZScore)
	for _, r := range results {
		if r.IsAnomaly {
			t.Errorf("uniform data should yield no anomalies")
		}
	}
}

// ─── ExtractFloatColumn tests ─────────────────────────────────────────────────

func TestExtractFloatColumn_Mixed(t *testing.T) {
	rows := []map[string]interface{}{
		{"sales": float64(100)},
		{"sales": "200"},
		{"sales": int64(300)},
		{"sales": "not-a-number"}, // should be skipped
		{"sales": nil},            // should be skipped
	}
	vals := engine.ExtractFloatColumn(rows, "sales")

	if len(vals) != 3 {
		t.Errorf("expected 3 valid floats, got %d: %v", len(vals), vals)
	}
	expected := []float64{100, 200, 300}
	for i, v := range vals {
		if v != expected[i] {
			t.Errorf("index %d: expected %.0f got %.0f", i, expected[i], v)
		}
	}
}

func TestExtractFloatColumn_Empty(t *testing.T) {
	vals := engine.ExtractFloatColumn(nil, "col")
	if len(vals) != 0 {
		t.Errorf("expected empty slice for nil rows")
	}
}

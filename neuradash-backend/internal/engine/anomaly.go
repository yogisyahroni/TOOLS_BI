package engine

import (
	"math"
	"sort"

	"gonum.org/v1/gonum/stat"
)

// AnomalyMethod defines the detection algorithm.
type AnomalyMethod string

const (
	MethodIQR    AnomalyMethod = "iqr"
	MethodZScore AnomalyMethod = "zscore"
)

// AnomalyResult carries a data point and its anomaly status.
type AnomalyResult struct {
	Index      int     `json:"index"`
	Value      float64 `json:"value"`
	IsAnomaly  bool    `json:"isAnomaly"`
	Score      float64 `json:"score,omitempty"` // z-score or distance from bounds
	LowerBound float64 `json:"lowerBound,omitempty"`
	UpperBound float64 `json:"upperBound,omitempty"`
}

// DetectAnomalies identifies outliers in a numeric slice using the specified method.
func DetectAnomalies(values []float64, method AnomalyMethod) []AnomalyResult {
	if len(values) == 0 {
		return nil
	}
	switch method {
	case MethodZScore:
		return detectZScore(values)
	default:
		return detectIQR(values)
	}
}

// detectIQR uses the interquartile range method (|x - Q1| > 1.5*IQR or > Q3+1.5*IQR).
func detectIQR(values []float64) []AnomalyResult {
	sorted := make([]float64, len(values))
	copy(sorted, values)
	sort.Float64s(sorted)

	q1 := stat.Quantile(0.25, stat.Empirical, sorted, nil)
	q3 := stat.Quantile(0.75, stat.Empirical, sorted, nil)
	iqr := q3 - q1

	lowerBound := q1 - 1.5*iqr
	upperBound := q3 + 1.5*iqr

	results := make([]AnomalyResult, len(values))
	for i, v := range values {
		isAnomaly := v < lowerBound || v > upperBound
		score := 0.0
		if v < lowerBound {
			score = lowerBound - v
		} else if v > upperBound {
			score = v - upperBound
		}
		results[i] = AnomalyResult{
			Index:      i,
			Value:      v,
			IsAnomaly:  isAnomaly,
			Score:      score,
			LowerBound: lowerBound,
			UpperBound: upperBound,
		}
	}
	return results
}

// detectZScore uses Z-score method (|z| > 3 is considered an anomaly).
func detectZScore(values []float64) []AnomalyResult {
	mean, stddev := stat.MeanStdDev(values, nil)
	if stddev == 0 {
		// All values are the same, no anomalies
		results := make([]AnomalyResult, len(values))
		for i, v := range values {
			results[i] = AnomalyResult{Index: i, Value: v, IsAnomaly: false, Score: 0}
		}
		return results
	}

	results := make([]AnomalyResult, len(values))
	for i, v := range values {
		z := math.Abs((v - mean) / stddev)
		results[i] = AnomalyResult{
			Index:     i,
			Value:     v,
			IsAnomaly: z > 3.0,
			Score:     z,
		}
	}
	return results
}

// ExtractFloatColumn takes a slice of row maps and extracts a named numeric column.
func ExtractFloatColumn(rows []map[string]interface{}, colName string) []float64 {
	result := make([]float64, 0, len(rows))
	for _, row := range rows {
		if v, ok := parseFloat(row[colName]); ok {
			result = append(result, v)
		}
	}
	return result
}

package main

import (
	"fmt"
	"strings"
)

// Mocking the engine logic for quick verification
func main() {
	inputRows := []map[string]interface{}{
		{"city": "Jakarta", "sales": 100.0, "qty": 5},
		{"city": "Jakarta", "sales": 200.0, "qty": 10},
		{"city": "Bandung", "sales": 150.0, "qty": 3},
	}

	config := map[string]interface{}{
		"groupBy": []interface{}{"city"},
		"aggregations": []interface{}{
			map[string]interface{}{"column": "sales", "function": "sum", "alias": "total_sales"},
			map[string]interface{}{"column": "qty", "function": "avg", "alias": "avg_qty"},
		},
	}

	// Helper functions from visual_etl.go logic
	groupBy := []string{"city"}
	aggsRaw := config["aggregations"].([]interface{})

	type group struct {
		rows  []map[string]interface{}
		label map[string]interface{}
	}
	groups := map[string]*group{}
	keys := []string{}

	for _, row := range inputRows {
		keyParts := make([]string, len(groupBy))
		for i, g := range groupBy {
			keyParts[i] = fmt.Sprintf("%v", row[g])
		}
		key := strings.Join(keyParts, "||")

		if _, ok := groups[key]; !ok {
			label := map[string]interface{}{}
			for _, g := range groupBy {
				label[g] = row[g]
			}
			groups[key] = &group{label: label}
			keys = append(keys, key)
		}
		groups[key].rows = append(groups[key].rows, row)
	}

	for _, key := range keys {
		g := groups[key]
		fmt.Printf("Group: %v\n", g.label)
		for _, aggRaw := range aggsRaw {
			agg := aggRaw.(map[string]interface{})
			col := agg["column"].(string)
			fn := agg["function"].(string)
			alias := agg["alias"].(string)

			var vals []float64
			for _, r := range g.rows {
				v := r[col].(float64)
				vals = append(vals, v)
			}

			var res float64
			if fn == "sum" {
				for _, v := range vals {
					res += v
				}
			} else if fn == "avg" {
				if len(vals) > 0 {
					for _, v := range vals {
						res += v
					}
					res /= float64(len(vals))
				}
			}
			fmt.Printf("  %s: %f\n", alias, res)
		}
	}
}

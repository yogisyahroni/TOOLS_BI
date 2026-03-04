package engine

// visual_etl.go — Visual ETL pipeline engine
//
// A VisualPipeline is a DAG (Directed Acyclic Graph) of Nodes.
// Each node has a Type that maps to a Processor function.
// Execution order is determined by topological sort (Kahn's algorithm).
//
// Supported node types:
//   source       — load rows from an existing dataset table (via GORM raw query)
//   filter       — WHERE-style row filtering (operator + threshold on a column)
//   select       — keep only specified columns
//   rename       — rename a column
//   cast         — cast a column to a target type (string/int/float/bool)
//   derive       — add a new column computed by a formula expression
//   aggregate    — GROUP BY + SUM/AVG/COUNT/MIN/MAX
//   sort         — ORDER BY one or more columns
//   limit        — top-N rows
//   join         — inner-join two node outputs on a key column
//   union        — concatenate rows from two node outputs (UNION ALL)
//   dedup        — remove duplicate rows based on key columns
//
// Usage:
//   result, err := engine.RunVisualPipeline(db, spec)
//   // result.Rows — final transformed rows
//   // result.NodeOutputs — each node's output, keyed by node ID

import (
	"fmt"
	"sort"
	"strings"

	"gorm.io/gorm"
)

// ─── Public types ─────────────────────────────────────────────────────────────

// NodeSpec defines one node in the visual pipeline graph.
type NodeSpec struct {
	ID     string                 `json:"id"`
	Type   string                 `json:"type"`   // see supported types above
	Label  string                 `json:"label"`  // human-readable name
	Config map[string]interface{} `json:"config"` // node-specific parameters
	Inputs []string               `json:"inputs"` // IDs of upstream nodes
}

// PipelineSpec is the complete DAG definition.
type PipelineSpec struct {
	Nodes []NodeSpec `json:"nodes"`
}

// PipelineResult carries the final and intermediate outputs.
type PipelineResult struct {
	Rows        []map[string]interface{}            // final output rows
	NodeOutputs map[string][]map[string]interface{} // nodeID → rows
	Errors      map[string]string                   // nodeID → error (if any)
	Order       []string                            // execution order
}

// ─── Entry point ─────────────────────────────────────────────────────────────

// RunVisualPipeline executes a visual ETL pipeline and returns the result.
// The result of the last node in topological order is the final output.
func RunVisualPipeline(db *gorm.DB, spec PipelineSpec) (*PipelineResult, error) {
	order, err := topoSort(spec.Nodes)
	if err != nil {
		return nil, fmt.Errorf("pipeline DAG error: %w", err)
	}

	// Build a lookup map for nodes
	nodeMap := map[string]NodeSpec{}
	for _, n := range spec.Nodes {
		nodeMap[n.ID] = n
	}

	result := &PipelineResult{
		NodeOutputs: make(map[string][]map[string]interface{}),
		Errors:      make(map[string]string),
		Order:       order,
	}

	var lastID string
	for _, id := range order {
		node := nodeMap[id]

		// Collect inputs
		var inputRows [][]map[string]interface{}
		for _, inID := range node.Inputs {
			rows, ok := result.NodeOutputs[inID]
			if !ok {
				rows = nil
			}
			inputRows = append(inputRows, rows)
		}

		rows, err := runNode(db, node, inputRows)
		if err != nil {
			result.Errors[id] = err.Error()
			rows = nil // continue with empty
		}
		result.NodeOutputs[id] = rows
		lastID = id
	}

	if lastID != "" {
		result.Rows = result.NodeOutputs[lastID]
	}
	return result, nil
}

// ─── Topological sort (Kahn's algorithm) ─────────────────────────────────────

func topoSort(nodes []NodeSpec) ([]string, error) {
	inDegree := map[string]int{}
	adj := map[string][]string{} // node → list of dependent node IDs

	ids := make([]string, 0, len(nodes))
	for _, n := range nodes {
		inDegree[n.ID] = 0
		ids = append(ids, n.ID)
	}

	for _, n := range nodes {
		for _, inp := range n.Inputs {
			adj[inp] = append(adj[inp], n.ID)
			inDegree[n.ID]++
		}
	}

	// Queue starts with zero-in-degree nodes (sources)
	var queue []string
	for _, id := range ids {
		if inDegree[id] == 0 {
			queue = append(queue, id)
		}
	}
	// Stable order for deterministic output
	sort.Strings(queue)

	var order []string
	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]
		order = append(order, cur)

		neighbors := adj[cur]
		sort.Strings(neighbors)
		for _, nb := range neighbors {
			inDegree[nb]--
			if inDegree[nb] == 0 {
				queue = append(queue, nb)
			}
		}
		sort.Strings(queue)
	}

	if len(order) != len(nodes) {
		return nil, fmt.Errorf("cycle detected in pipeline graph")
	}
	return order, nil
}

// ─── Node runner — dispatches by type ────────────────────────────────────────

func runNode(db *gorm.DB, node NodeSpec, inputs [][]map[string]interface{}) ([]map[string]interface{}, error) {
	cfg := node.Config
	if cfg == nil {
		cfg = map[string]interface{}{}
	}

	switch strings.ToLower(node.Type) {

	// ── source ────────────────────────────────────────────────────────────────
	case "source":
		table := cfgStr(cfg, "table")
		if table == "" {
			return nil, fmt.Errorf("source node requires config.table")
		}
		var rows []map[string]interface{}
		if err := db.Raw(fmt.Sprintf(`SELECT * FROM "%s"`, table)).Find(&rows).Error; err != nil {
			return nil, fmt.Errorf("source: query failed: %w", err)
		}
		return rows, nil

	// ── filter ────────────────────────────────────────────────────────────────
	case "filter":
		rows := firstInput(inputs)
		col := cfgStr(cfg, "column")
		op := cfgStr(cfg, "operator") // >, <, =, >=, <=, !=
		threshold := cfgFloat(cfg, "value")

		var out []map[string]interface{}
		for _, row := range rows {
			v, ok := parseFloat(row[col])
			if !ok {
				continue
			}
			if applyOp(op, v, threshold) {
				out = append(out, row)
			}
		}
		return out, nil

	// ── select ────────────────────────────────────────────────────────────────
	case "select":
		rows := firstInput(inputs)
		cols := cfgStrSlice(cfg, "columns")
		if len(cols) == 0 {
			return rows, nil
		}
		out := make([]map[string]interface{}, 0, len(rows))
		for _, row := range rows {
			newRow := make(map[string]interface{}, len(cols))
			for _, c := range cols {
				newRow[c] = row[c]
			}
			out = append(out, newRow)
		}
		return out, nil

	// ── rename ────────────────────────────────────────────────────────────────
	case "rename":
		rows := firstInput(inputs)
		from := cfgStr(cfg, "from")
		to := cfgStr(cfg, "to")
		if from == "" || to == "" {
			return rows, nil
		}
		out := make([]map[string]interface{}, 0, len(rows))
		for _, row := range rows {
			newRow := copyRow(row)
			newRow[to] = newRow[from]
			delete(newRow, from)
			out = append(out, newRow)
		}
		return out, nil

	// ── cast ──────────────────────────────────────────────────────────────────
	case "cast":
		rows := firstInput(inputs)
		col := cfgStr(cfg, "column")
		targetType := strings.ToLower(cfgStr(cfg, "targetType")) // string, int, float, bool
		out := make([]map[string]interface{}, 0, len(rows))
		for _, row := range rows {
			newRow := copyRow(row)
			raw := fmt.Sprintf("%v", row[col])
			switch targetType {
			case "float", "number":
				f, _ := toFloat(row[col])
				newRow[col] = f
			case "int", "integer":
				f, _ := toFloat(row[col])
				newRow[col] = int64(f)
			case "bool", "boolean":
				f, _ := toFloat(row[col])
				newRow[col] = f != 0
			default: // string
				newRow[col] = raw
			}
			out = append(out, newRow)
		}
		return out, nil

	// ── derive ────────────────────────────────────────────────────────────────
	case "derive":
		rows := firstInput(inputs)
		newCol := cfgStr(cfg, "column")
		formula := cfgStr(cfg, "formula")
		if newCol == "" || formula == "" {
			return rows, nil
		}
		out := make([]map[string]interface{}, 0, len(rows))
		for _, row := range rows {
			newRow := copyRow(row)
			ctx := FormulaContext{Rows: rows, CurrentRow: row}
			val, err := Evaluate(formula, ctx)
			if err != nil {
				newRow[newCol] = nil
			} else {
				newRow[newCol] = val
			}
			out = append(out, newRow)
		}
		return out, nil

	// ── aggregate ─────────────────────────────────────────────────────────────
	case "aggregate":
		rows := firstInput(inputs)
		groupBy := cfgStrSlice(cfg, "groupBy")
		metric := cfgStr(cfg, "metric")
		aggFn := strings.ToLower(cfgStr(cfg, "aggregation"))

		// Group rows by key
		type group struct {
			vals  []float64
			label map[string]interface{}
		}
		groups := map[string]*group{}
		keys := []string{} // preserve insertion order

		for _, row := range rows {
			// Build group key
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
			if f, ok := parseFloat(row[metric]); ok {
				groups[key].vals = append(groups[key].vals, f)
			}
		}

		out := make([]map[string]interface{}, 0, len(groups))
		for _, key := range keys {
			g := groups[key]
			row := copyRow(g.label)
			vals := g.vals
			var agg float64
			switch aggFn {
			case "sum":
				agg = sumSlice(vals)
			case "avg", "average":
				if len(vals) > 0 {
					agg = sumSlice(vals) / float64(len(vals))
				}
			case "min":
				if len(vals) > 0 {
					agg = vals[0]
					for _, v := range vals[1:] {
						if v < agg {
							agg = v
						}
					}
				}
			case "max":
				if len(vals) > 0 {
					agg = vals[0]
					for _, v := range vals[1:] {
						if v > agg {
							agg = v
						}
					}
				}
			default: // count
				agg = float64(len(vals))
			}
			row[metric] = agg
			out = append(out, row)
		}
		return out, nil

	// ── sort ──────────────────────────────────────────────────────────────────
	case "sort":
		rows := firstInput(inputs)
		col := cfgStr(cfg, "column")
		desc := cfgBool(cfg, "desc")
		sorted := make([]map[string]interface{}, len(rows))
		copy(sorted, rows)
		sort.SliceStable(sorted, func(i, j int) bool {
			a, _ := toFloat(sorted[i][col])
			b, _ := toFloat(sorted[j][col])
			if desc {
				return a > b
			}
			return a < b
		})
		return sorted, nil

	// ── limit ─────────────────────────────────────────────────────────────────
	case "limit":
		rows := firstInput(inputs)
		n := int(cfgFloat(cfg, "n"))
		if n <= 0 || n > len(rows) {
			return rows, nil
		}
		return rows[:n], nil

	// ── join ──────────────────────────────────────────────────────────────────
	case "join":
		if len(inputs) < 2 {
			return nil, fmt.Errorf("join node requires 2 inputs")
		}
		left := inputs[0]
		right := inputs[1]
		key := cfgStr(cfg, "key")

		// Build hash from right side
		rightMap := map[string]map[string]interface{}{}
		for _, row := range right {
			k := fmt.Sprintf("%v", row[key])
			rightMap[k] = row
		}

		var out []map[string]interface{}
		for _, lrow := range left {
			k := fmt.Sprintf("%v", lrow[key])
			if rrow, ok := rightMap[k]; ok {
				merged := copyRow(lrow)
				for col, val := range rrow {
					if _, exists := merged[col]; !exists {
						merged[col] = val
					} else {
						merged["r_"+col] = val // prefix right-side duplicates
					}
				}
				out = append(out, merged)
			}
		}
		return out, nil

	// ── union ─────────────────────────────────────────────────────────────────
	case "union":
		var out []map[string]interface{}
		for _, inp := range inputs {
			out = append(out, inp...)
		}
		return out, nil

	// ── dedup ─────────────────────────────────────────────────────────────────
	case "dedup":
		rows := firstInput(inputs)
		keys := cfgStrSlice(cfg, "keys")
		seen := map[string]bool{}
		var out []map[string]interface{}
		for _, row := range rows {
			var keyParts []string
			for _, k := range keys {
				keyParts = append(keyParts, fmt.Sprintf("%v", row[k]))
			}
			key := strings.Join(keyParts, "||")
			if !seen[key] {
				seen[key] = true
				out = append(out, row)
			}
		}
		return out, nil

	// ── __inmemory__ — test-only node: inject rows from config ───────────────
	case "__inmemory__":
		raw, ok := cfg["rows"]
		if !ok {
			return nil, nil
		}
		rows, ok := raw.([]map[string]interface{})
		if !ok {
			return nil, nil
		}
		return rows, nil

	default:
		return nil, fmt.Errorf("unknown node type %q", node.Type)
	}
}

// ─── Config helpers ───────────────────────────────────────────────────────────

func cfgStr(cfg map[string]interface{}, key string) string {
	if v, ok := cfg[key]; ok {
		return fmt.Sprintf("%v", v)
	}
	return ""
}

func cfgFloat(cfg map[string]interface{}, key string) float64 {
	if v, ok := cfg[key]; ok {
		f, _ := toFloat(v)
		return f
	}
	return 0
}

func cfgBool(cfg map[string]interface{}, key string) bool {
	if v, ok := cfg[key]; ok {
		switch val := v.(type) {
		case bool:
			return val
		case string:
			return strings.EqualFold(val, "true") || val == "1"
		}
		f, _ := toFloat(v)
		return f != 0
	}
	return false
}

func cfgStrSlice(cfg map[string]interface{}, key string) []string {
	v, ok := cfg[key]
	if !ok {
		return nil
	}
	switch val := v.(type) {
	case []string:
		return val
	case []interface{}:
		out := make([]string, len(val))
		for i, sv := range val {
			out[i] = fmt.Sprintf("%v", sv)
		}
		return out
	case string:
		if val == "" {
			return nil
		}
		// comma-separated
		parts := strings.Split(val, ",")
		out := make([]string, len(parts))
		for i, p := range parts {
			out[i] = strings.TrimSpace(p)
		}
		return out
	}
	return nil
}

func firstInput(inputs [][]map[string]interface{}) []map[string]interface{} {
	if len(inputs) == 0 {
		return nil
	}
	return inputs[0]
}

func copyRow(row map[string]interface{}) map[string]interface{} {
	newRow := make(map[string]interface{}, len(row))
	for k, v := range row {
		newRow[k] = v
	}
	return newRow
}

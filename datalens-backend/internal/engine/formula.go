package engine

// formula.go — DAX-like expression evaluator
//
// Supported functions (case-insensitive):
//   CALCULATE(expr, [filters...]) — evaluate expr with filter context
//   SUM(column)                   — sum all values in column
//   SUMIF(column, cond, val)      — conditional sum
//   AVERAGE(column)               — arithmetic mean
//   COUNT(column)                 — non-null row count
//   COUNTIF(column, cond, val)    — conditional count
//   DISTINCTCOUNT(column)         — count distinct values
//   MIN(column) / MAX(column)     — extremes
//   IF(cond, true_val, [false_val]) — conditional expression
//   AND(a, b) / OR(a, b)          — logical combinators
//   NOT(expr)                     — logical negation
//   ISBLANK(column)               — null/zero check
//   ROUND(val, decimals)          — round to N decimal places
//   ABS(val)                      — absolute value
//   DIVIDE(x, y, [alt])           — safe division (returns alt if y=0)
//   VAR(col)                      — variance (population)
//   STDEV(col)                    — standard deviation (population)
//   SWITCH(expr, v1,r1, v2,r2, [else]) — multi-way branch
//   COALESCE(a, b, ...)           — first non-zero value
//   BLANK()                       — zero sentinel
//
// Expression context (FormulaContext):
//   - Rows []map[string]interface{} — the dataset rows
//   - CurrentRow map[string]interface{} — single row during row-level calc
//
// Usage:
//   ctx := engine.FormulaContext{Rows: myRows}
//   result, err := engine.Evaluate("SUM(sales) / COUNT(orders)", ctx)

import (
	"fmt"
	"math"
	"strconv"
	"strings"
)

// ─── Public surface ───────────────────────────────────────────────────────────

// FormulaContext provides the data rows over which the formula is evaluated.
type FormulaContext struct {
	Rows       []map[string]interface{} // full dataset
	CurrentRow map[string]interface{}   // set when evaluating row-level formulas
}

// Evaluate parses and evaluates a formula string against a FormulaContext.
// Returns float64 for numeric results; string for text; nil for BLANK.
func Evaluate(formula string, ctx FormulaContext) (interface{}, error) {
	formula = strings.TrimSpace(formula)
	if formula == "" {
		return nil, fmt.Errorf("formula is empty")
	}
	p := &parser{input: formula, pos: 0}
	expr, err := p.parseExpr()
	if err != nil {
		return nil, fmt.Errorf("formula parse error: %w", err)
	}
	return expr.eval(ctx)
}

// ─── AST node interface ───────────────────────────────────────────────────────

type exprNode interface {
	eval(ctx FormulaContext) (interface{}, error)
}

// ─── Literal nodes ────────────────────────────────────────────────────────────

type numberLiteral struct{ val float64 }

func (n *numberLiteral) eval(_ FormulaContext) (interface{}, error) { return n.val, nil }

type stringLiteral struct{ val string }

func (s *stringLiteral) eval(_ FormulaContext) (interface{}, error) { return s.val, nil }

type blankLiteral struct{}

func (b *blankLiteral) eval(_ FormulaContext) (interface{}, error) { return 0.0, nil }

// ─── Binary operation node ────────────────────────────────────────────────────

type binOp struct {
	op    string
	left  exprNode
	right exprNode
}

func (b *binOp) eval(ctx FormulaContext) (interface{}, error) {
	lv, err := b.left.eval(ctx)
	if err != nil {
		return nil, err
	}
	rv, err := b.right.eval(ctx)
	if err != nil {
		return nil, err
	}
	lf, lok := toFloat(lv)
	rf, rok := toFloat(rv)
	if !lok || !rok {
		return nil, fmt.Errorf("operator %q requires numeric operands", b.op)
	}
	switch b.op {
	case "+":
		return lf + rf, nil
	case "-":
		return lf - rf, nil
	case "*":
		return lf * rf, nil
	case "/":
		if rf == 0 {
			return 0.0, nil // safe divide: return 0
		}
		return lf / rf, nil
	case ">":
		return boolToFloat(lf > rf), nil
	case "<":
		return boolToFloat(lf < rf), nil
	case ">=":
		return boolToFloat(lf >= rf), nil
	case "<=":
		return boolToFloat(lf <= rf), nil
	case "=", "==":
		return boolToFloat(lf == rf), nil
	case "<>", "!=":
		return boolToFloat(lf != rf), nil
	}
	return nil, fmt.Errorf("unknown operator %q", b.op)
}

// ─── Function call node ───────────────────────────────────────────────────────

type funcCall struct {
	name string
	args []exprNode
}

func (f *funcCall) eval(ctx FormulaContext) (interface{}, error) {
	name := strings.ToUpper(f.name)

	// Helper: evaluate all args
	evalArgs := func() ([]interface{}, error) {
		vals := make([]interface{}, len(f.args))
		for i, a := range f.args {
			v, err := a.eval(ctx)
			if err != nil {
				return nil, err
			}
			vals[i] = v
		}
		return vals, nil
	}

	switch name {

	// ── BLANK() ──────────────────────────────────────────────────────────────
	case "BLANK":
		return 0.0, nil

	// ── SUM(col) ─────────────────────────────────────────────────────────────
	case "SUM":
		col, err := colName(f.args, 0, "SUM")
		if err != nil {
			return nil, err
		}
		return sumCol(ctx.Rows, col), nil

	// ── SUMIF(col, op, val) ──────────────────────────────────────────────────
	case "SUMIF":
		if len(f.args) < 3 {
			return nil, fmt.Errorf("SUMIF requires 3 arguments")
		}
		col, err := colName(f.args, 0, "SUMIF")
		if err != nil {
			return nil, err
		}
		opStr, err := colName(f.args, 1, "SUMIF op")
		if err != nil {
			return nil, err
		}
		threshold, err := f.args[2].eval(ctx)
		if err != nil {
			return nil, err
		}
		tf, _ := toFloat(threshold)
		var total float64
		for _, row := range ctx.Rows {
			v, ok := parseFloat(row[col])
			if !ok {
				continue
			}
			if applyOp(opStr, v, tf) {
				total += v
			}
		}
		return total, nil

	// ── AVERAGE(col) ─────────────────────────────────────────────────────────
	case "AVERAGE":
		col, err := colName(f.args, 0, "AVERAGE")
		if err != nil {
			return nil, err
		}
		vals := extractFloats(ctx.Rows, col)
		if len(vals) == 0 {
			return 0.0, nil
		}
		return sumSlice(vals) / float64(len(vals)), nil

	// ── COUNT(col) ───────────────────────────────────────────────────────────
	case "COUNT":
		col, err := colName(f.args, 0, "COUNT")
		if err != nil {
			return nil, err
		}
		count := 0
		for _, row := range ctx.Rows {
			if !isBlankVal(row[col]) {
				count++
			}
		}
		return float64(count), nil

	// ── COUNTIF(col, op, val) ────────────────────────────────────────────────
	case "COUNTIF":
		if len(f.args) < 3 {
			return nil, fmt.Errorf("COUNTIF requires 3 arguments")
		}
		col, err := colName(f.args, 0, "COUNTIF")
		if err != nil {
			return nil, err
		}
		opStr, err := colName(f.args, 1, "COUNTIF op")
		if err != nil {
			return nil, err
		}
		threshold, _ := f.args[2].eval(ctx)
		tf, _ := toFloat(threshold)
		count := 0
		for _, row := range ctx.Rows {
			v, ok := parseFloat(row[col])
			if ok && applyOp(opStr, v, tf) {
				count++
			}
		}
		return float64(count), nil

	// ── DISTINCTCOUNT(col) ───────────────────────────────────────────────────
	case "DISTINCTCOUNT":
		col, err := colName(f.args, 0, "DISTINCTCOUNT")
		if err != nil {
			return nil, err
		}
		seen := map[string]bool{}
		for _, row := range ctx.Rows {
			if v := row[col]; v != nil {
				seen[fmt.Sprintf("%v", v)] = true
			}
		}
		return float64(len(seen)), nil

	// ── MIN(col) / MAX(col) ───────────────────────────────────────────────────
	case "MIN", "MAX":
		col, err := colName(f.args, 0, name)
		if err != nil {
			return nil, err
		}
		vals := extractFloats(ctx.Rows, col)
		if len(vals) == 0 {
			return 0.0, nil
		}
		res := vals[0]
		for _, v := range vals[1:] {
			if name == "MIN" && v < res {
				res = v
			}
			if name == "MAX" && v > res {
				res = v
			}
		}
		return res, nil

	// ── IF(cond, true_val, [false_val]) ──────────────────────────────────────
	case "IF":
		if len(f.args) < 2 {
			return nil, fmt.Errorf("IF requires at least 2 arguments")
		}
		cond, err := f.args[0].eval(ctx)
		if err != nil {
			return nil, err
		}
		cv, _ := toFloat(cond)
		if cv != 0 {
			return f.args[1].eval(ctx)
		}
		if len(f.args) >= 3 {
			return f.args[2].eval(ctx)
		}
		return 0.0, nil

	// ── AND(a, b) / OR(a, b) ─────────────────────────────────────────────────
	case "AND":
		vals, err := evalArgs()
		if err != nil {
			return nil, err
		}
		for _, v := range vals {
			f, _ := toFloat(v)
			if f == 0 {
				return 0.0, nil
			}
		}
		return 1.0, nil

	case "OR":
		vals, err := evalArgs()
		if err != nil {
			return nil, err
		}
		for _, v := range vals {
			f, _ := toFloat(v)
			if f != 0 {
				return 1.0, nil
			}
		}
		return 0.0, nil

	// ── NOT(expr) ────────────────────────────────────────────────────────────
	case "NOT":
		if len(f.args) < 1 {
			return nil, fmt.Errorf("NOT requires 1 argument")
		}
		v, err := f.args[0].eval(ctx)
		if err != nil {
			return nil, err
		}
		fv, _ := toFloat(v)
		if fv == 0 {
			return 1.0, nil
		}
		return 0.0, nil

	// ── ISBLANK(col) ─────────────────────────────────────────────────────────
	case "ISBLANK":
		col, err := colName(f.args, 0, "ISBLANK")
		if err != nil {
			return nil, err
		}
		if ctx.CurrentRow == nil {
			return 0.0, nil
		}
		if isBlankVal(ctx.CurrentRow[col]) {
			return 1.0, nil
		}
		return 0.0, nil

	// ── ROUND(val, decimals) ──────────────────────────────────────────────────
	case "ROUND":
		if len(f.args) < 2 {
			return nil, fmt.Errorf("ROUND requires 2 arguments")
		}
		v, err := f.args[0].eval(ctx)
		if err != nil {
			return nil, err
		}
		d, err := f.args[1].eval(ctx)
		if err != nil {
			return nil, err
		}
		fv, _ := toFloat(v)
		fd, _ := toFloat(d)
		factor := math.Pow(10, fd)
		return math.Round(fv*factor) / factor, nil

	// ── ABS(val) ─────────────────────────────────────────────────────────────
	case "ABS":
		if len(f.args) < 1 {
			return nil, fmt.Errorf("ABS requires 1 argument")
		}
		v, err := f.args[0].eval(ctx)
		if err != nil {
			return nil, err
		}
		fv, _ := toFloat(v)
		return math.Abs(fv), nil

	// ── DIVIDE(x, y, [alt]) ───────────────────────────────────────────────────
	case "DIVIDE":
		if len(f.args) < 2 {
			return nil, fmt.Errorf("DIVIDE requires 2 arguments")
		}
		xv, err := f.args[0].eval(ctx)
		if err != nil {
			return nil, err
		}
		yv, err := f.args[1].eval(ctx)
		if err != nil {
			return nil, err
		}
		x, _ := toFloat(xv)
		y, _ := toFloat(yv)
		if y == 0 {
			if len(f.args) >= 3 {
				return f.args[2].eval(ctx)
			}
			return 0.0, nil
		}
		return x / y, nil

	// ── VAR(col) / STDEV(col) ─────────────────────────────────────────────────
	case "VAR", "STDEV":
		col, err := colName(f.args, 0, name)
		if err != nil {
			return nil, err
		}
		vals := extractFloats(ctx.Rows, col)
		if len(vals) == 0 {
			return 0.0, nil
		}
		mean := sumSlice(vals) / float64(len(vals))
		var variance float64
		for _, v := range vals {
			d := v - mean
			variance += d * d
		}
		variance /= float64(len(vals))
		if name == "STDEV" {
			return math.Sqrt(variance), nil
		}
		return variance, nil

	// ── SWITCH(expr, val1, result1, val2, result2, ..., [else]) ──────────────
	case "SWITCH":
		if len(f.args) < 3 {
			return nil, fmt.Errorf("SWITCH requires at least 3 arguments")
		}
		switchVal, err := f.args[0].eval(ctx)
		if err != nil {
			return nil, err
		}
		sv := fmt.Sprintf("%v", switchVal)
		// pairs: args[1], args[2], args[3], args[4], ...
		for i := 1; i+1 < len(f.args); i += 2 {
			matchVal, err := f.args[i].eval(ctx)
			if err != nil {
				return nil, err
			}
			if sv == fmt.Sprintf("%v", matchVal) {
				return f.args[i+1].eval(ctx)
			}
		}
		// else clause (odd trailing arg)
		if len(f.args)%2 == 0 {
			return f.args[len(f.args)-1].eval(ctx)
		}
		return 0.0, nil

	// ── COALESCE(a, b, ...) ───────────────────────────────────────────────────
	case "COALESCE":
		for _, arg := range f.args {
			v, err := arg.eval(ctx)
			if err != nil {
				continue
			}
			fv, ok := toFloat(v)
			if ok && fv != 0 {
				return fv, nil
			}
		}
		return 0.0, nil

	// ── CALCULATE(expr, filters...) ───────────────────────────────────────────
	case "CALCULATE":
		if len(f.args) < 1 {
			return nil, fmt.Errorf("CALCULATE requires at least 1 argument")
		}
		// For now: evaluate the inner expression in the same context.
		// Filter context application is a future enhancement.
		return f.args[0].eval(ctx)

	default:
		return nil, fmt.Errorf("unknown function %q", f.name)
	}
}

// ─── Parser ───────────────────────────────────────────────────────────────────

type parser struct {
	input string
	pos   int
}

func (p *parser) skipWS() {
	for p.pos < len(p.input) && (p.input[p.pos] == ' ' || p.input[p.pos] == '\t') {
		p.pos++
	}
}

func (p *parser) peek() byte {
	if p.pos >= len(p.input) {
		return 0
	}
	return p.input[p.pos]
}

func (p *parser) consume() byte {
	b := p.input[p.pos]
	p.pos++
	return b
}

// parseExpr handles + / - (left-to-right, lowest precedence)
func (p *parser) parseExpr() (exprNode, error) {
	left, err := p.parseTerm()
	if err != nil {
		return nil, err
	}
	for {
		p.skipWS()
		ch := p.peek()
		if ch != '+' && ch != '-' {
			break
		}
		// Look-ahead: avoid consuming comparison operators
		p.consume()
		p.skipWS()
		right, err := p.parseTerm()
		if err != nil {
			return nil, err
		}
		left = &binOp{op: string(ch), left: left, right: right}
	}
	return p.parseComparison(left)
}

// parseComparison handles >, <, >=, <=, =, <>, !=
func (p *parser) parseComparison(left exprNode) (exprNode, error) {
	p.skipWS()
	var op string
	switch p.peek() {
	case '>':
		p.consume()
		if p.peek() == '=' {
			p.consume()
			op = ">="
		} else {
			op = ">"
		}
	case '<':
		p.consume()
		if p.peek() == '>' {
			p.consume()
			op = "<>"
		} else if p.peek() == '=' {
			p.consume()
			op = "<="
		} else {
			op = "<"
		}
	case '=':
		p.consume()
		if p.peek() == '=' {
			p.consume()
		}
		op = "="
	case '!':
		p.consume()
		if p.peek() == '=' {
			p.consume()
		}
		op = "!="
	}
	if op == "" {
		return left, nil
	}
	p.skipWS()
	right, err := p.parseTerm()
	if err != nil {
		return nil, err
	}
	return &binOp{op: op, left: left, right: right}, nil
}

// parseTerm handles * and /
func (p *parser) parseTerm() (exprNode, error) {
	left, err := p.parsePrimary()
	if err != nil {
		return nil, err
	}
	for {
		p.skipWS()
		ch := p.peek()
		if ch != '*' && ch != '/' {
			break
		}
		p.consume()
		p.skipWS()
		right, err := p.parsePrimary()
		if err != nil {
			return nil, err
		}
		left = &binOp{op: string(ch), left: left, right: right}
	}
	return left, nil
}

// parsePrimary handles literals, identifiers, function calls, parenthesised expressions
func (p *parser) parsePrimary() (exprNode, error) {
	p.skipWS()
	if p.pos >= len(p.input) {
		return nil, fmt.Errorf("unexpected end of expression")
	}
	ch := p.peek()

	// Number literal
	if ch >= '0' && ch <= '9' || (ch == '-' && p.pos+1 < len(p.input) && p.input[p.pos+1] >= '0') {
		return p.parseNumber()
	}

	// String literal
	if ch == '"' || ch == '\'' {
		return p.parseString()
	}

	// Parenthesised expression
	if ch == '(' {
		p.consume()
		expr, err := p.parseExpr()
		if err != nil {
			return nil, err
		}
		p.skipWS()
		if p.peek() == ')' {
			p.consume()
		}
		return expr, nil
	}

	// Identifier / function name / column reference
	name := p.parseIdentifier()
	if name == "" {
		return nil, fmt.Errorf("unexpected character %q at pos %d", string(p.peek()), p.pos)
	}
	p.skipWS()
	if p.peek() == '(' {
		// Function call
		p.consume() // consume '('
		args, err := p.parseArgList()
		if err != nil {
			return nil, err
		}
		return &funcCall{name: name, args: args}, nil
	}
	// Column reference treated as string literal (column name)
	return &stringLiteral{val: name}, nil
}

func (p *parser) parseNumber() (exprNode, error) {
	start := p.pos
	for p.pos < len(p.input) && (p.input[p.pos] >= '0' && p.input[p.pos] <= '9' ||
		p.input[p.pos] == '.' || (p.pos == start && p.input[p.pos] == '-')) {
		p.pos++
	}
	f, err := strconv.ParseFloat(p.input[start:p.pos], 64)
	if err != nil {
		return nil, fmt.Errorf("invalid number: %s", p.input[start:p.pos])
	}
	return &numberLiteral{val: f}, nil
}

func (p *parser) parseString() (exprNode, error) {
	quote := p.consume()
	var sb strings.Builder
	for p.pos < len(p.input) && p.input[p.pos] != quote {
		sb.WriteByte(p.consume())
	}
	if p.pos < len(p.input) {
		p.consume() // consume closing quote
	}
	return &stringLiteral{val: sb.String()}, nil
}

func (p *parser) parseIdentifier() string {
	start := p.pos
	for p.pos < len(p.input) {
		c := p.input[p.pos]
		if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
			(c >= '0' && c <= '9') || c == '_' {
			p.pos++
		} else {
			break
		}
	}
	return p.input[start:p.pos]
}

func (p *parser) parseArgList() ([]exprNode, error) {
	var args []exprNode
	for {
		p.skipWS()
		if p.peek() == ')' {
			p.consume()
			break
		}
		if len(args) > 0 {
			if p.peek() != ',' {
				return nil, fmt.Errorf("expected ',' between arguments at pos %d", p.pos)
			}
			p.consume() // consume ','
		}
		arg, err := p.parseExpr()
		if err != nil {
			return nil, err
		}
		args = append(args, arg)
	}
	return args, nil
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func toFloat(v interface{}) (float64, bool) {
	switch val := v.(type) {
	case float64:
		return val, true
	case float32:
		return float64(val), true
	case int:
		return float64(val), true
	case int64:
		return float64(val), true
	case int32:
		return float64(val), true
	case string:
		f, err := strconv.ParseFloat(val, 64)
		return f, err == nil
	}
	return 0, false
}

func boolToFloat(b bool) float64 {
	if b {
		return 1.0
	}
	return 0.0
}

func isBlankVal(v interface{}) bool {
	if v == nil {
		return true
	}
	f, ok := toFloat(v)
	return ok && f == 0
}

func colName(args []exprNode, idx int, fn string) (string, error) {
	if idx >= len(args) {
		return "", fmt.Errorf("%s: missing argument %d", fn, idx+1)
	}
	v, err := args[idx].eval(FormulaContext{})
	if err != nil {
		return "", err
	}
	s, ok := v.(string)
	if !ok {
		return fmt.Sprintf("%v", v), nil
	}
	return s, nil
}

func extractFloats(rows []map[string]interface{}, col string) []float64 {
	out := make([]float64, 0, len(rows))
	for _, row := range rows {
		if f, ok := parseFloat(row[col]); ok {
			out = append(out, f)
		}
	}
	return out
}

func sumCol(rows []map[string]interface{}, col string) float64 {
	var total float64
	for _, row := range rows {
		if f, ok := parseFloat(row[col]); ok {
			total += f
		}
	}
	return total
}

func sumSlice(vals []float64) float64 {
	var total float64
	for _, v := range vals {
		total += v
	}
	return total
}

func applyOp(op string, a, b float64) bool {
	// Trim quote chars that come from string literal parsing
	op = strings.Trim(op, `"'`)
	switch op {
	case ">":
		return a > b
	case "<":
		return a < b
	case ">=":
		return a >= b
	case "<=":
		return a <= b
	case "=", "==":
		return a == b
	case "<>", "!=":
		return a != b
	}
	return false
}

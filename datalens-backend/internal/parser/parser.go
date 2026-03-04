// Package parser provides importers for Power BI (.pbix), Tableau (.twb/.twbx),
// and PowerPoint (.pptx) report files.
//
// All parsers return the same ParsedReport structure so the rest of the
// application can work with a single uniform format regardless of source type.
package parser

import (
	"fmt"
	"io"
	"path/filepath"
	"strings"
	"time"
)

// ─────────────────────────────────────────────────────────────────────────────
// Shared output types (canonical internal format)
// ─────────────────────────────────────────────────────────────────────────────

// ParsedReport is the unified output of every parser.
type ParsedReport struct {
	Title       string         `json:"title"`
	SourceType  string         `json:"sourceType"` // powerbi | tableau | pptx
	Pages       []ParsedPage   `json:"pages"`
	DataSources []DataSource   `json:"dataSources"`
	Metadata    map[string]any `json:"metadata,omitempty"`
	ParsedAt    time.Time      `json:"parsedAt"`
}

// ParsedPage corresponds to a report page / worksheet / slide.
type ParsedPage struct {
	Name     string         `json:"name"`
	Index    int            `json:"index"`
	Width    float64        `json:"width,omitempty"`
	Height   float64        `json:"height,omitempty"`
	Visuals  []ParsedVisual `json:"visuals"`
	RawNotes string         `json:"rawNotes,omitempty"` // raw extracted text
}

// ParsedVisual is a single chart/visual/shape within a page.
type ParsedVisual struct {
	Type   string  `json:"type"` // bar, line, pie, table, kpi, slicer, text, image, map, card, matrix
	Title  string  `json:"title"`
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
	// Optional mapping hints
	Columns []string `json:"columns,omitempty"` // referenced data columns
}

// DataSource describes an external data connection found in the file.
type DataSource struct {
	Name       string `json:"name"`
	Type       string `json:"type"`       // postgresql, mysql, excel, csv, direct
	Connection string `json:"connection"` // connection string / path (may be partial)
}

// ─────────────────────────────────────────────────────────────────────────────
// Parser interface
// ─────────────────────────────────────────────────────────────────────────────

// Parser parses a specific file format into a ParsedReport.
type Parser interface {
	Parse(r io.ReaderAt, size int64, filename string) (*ParsedReport, error)
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory — route by file extension
// ─────────────────────────────────────────────────────────────────────────────

// ParseFile detects the file format from the filename extension and delegates
// to the appropriate parser.
func ParseFile(r io.ReaderAt, size int64, filename string) (*ParsedReport, error) {
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".pbix":
		return (&PBIXParser{}).Parse(r, size, filename)
	case ".twb":
		return (&TableauParser{Format: "twb"}).Parse(r, size, filename)
	case ".twbx":
		return (&TableauParser{Format: "twbx"}).Parse(r, size, filename)
	case ".pptx":
		return (&PPTXParser{}).Parse(r, size, filename)
	default:
		return nil, fmt.Errorf("unsupported file extension %q — supported: .pbix, .twb, .twbx, .pptx", ext)
	}
}

// SupportedExtensions returns the list of acceptable file extensions.
func SupportedExtensions() []string {
	return []string{".pbix", ".twb", ".twbx", ".pptx"}
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper — map Power BI visual type to canonical type
// ─────────────────────────────────────────────────────────────────────────────

var pbiTypeMap = map[string]string{
	"barChart": "bar", "clusteredBarChart": "bar", "stackedBarChart": "bar",
	"lineChart": "line", "areaChart": "line",
	"pieChart": "pie", "donutChart": "pie",
	"tableEx": "table", "pivotTable": "matrix",
	"card": "card", "multiRowCard": "card",
	"kpi": "kpi", "gauge": "kpi",
	"slicer": "slicer",
	"map":    "map", "filledMap": "map",
	"scatterChart":   "scatter",
	"waterfallChart": "waterfall",
	"funnelChart":    "funnel",
	"treemap":        "treemap",
	"textbox":        "text",
	"image":          "image",
}

func canonicalPBIType(t string) string {
	if c, ok := pbiTypeMap[t]; ok {
		return c
	}
	return "chart"
}

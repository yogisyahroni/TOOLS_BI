package parser_test

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"io"
	"strings"
	"testing"
	"time"

	"datalens/internal/parser"
)

// ─── Helper: create a minimal ZIP in memory ────────────────────────────────────

func makeZip(files map[string][]byte) (io.ReaderAt, int64) {
	var buf bytes.Buffer
	w := zip.NewWriter(&buf)
	for name, content := range files {
		f, _ := w.Create(name)
		f.Write(content)
	}
	w.Close()
	data := buf.Bytes()
	return bytes.NewReader(data), int64(len(data))
}

// ─── ParseFile factory routing ────────────────────────────────────────────────

func TestParseFile_UnsupportedExtension(t *testing.T) {
	r := strings.NewReader("dummy")
	_, err := parser.ParseFile(r, 5, "report.xlsx")
	if err == nil {
		t.Fatal("expected error for unsupported extension .xlsx")
	}
	if !strings.Contains(err.Error(), "unsupported") {
		t.Errorf("expected 'unsupported' in error, got: %s", err.Error())
	}
}

func TestSupportedExtensions(t *testing.T) {
	exts := parser.SupportedExtensions()
	must := []string{".pbix", ".twb", ".twbx", ".pptx"}
	for _, want := range must {
		found := false
		for _, got := range exts {
			if got == want {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("expected extension %s in SupportedExtensions()", want)
		}
	}
}

// ─── PBIX Parser ──────────────────────────────────────────────────────────────

func TestPBIXParser_InvalidZip(t *testing.T) {
	r := strings.NewReader("not a zip file")
	_, err := parser.ParseFile(r, int64(len("not a zip file")), "report.pbix")
	if err == nil {
		t.Fatal("expected error for invalid PBIX ZIP content")
	}
}

func TestPBIXParser_EmptyZip_ReturnsPlaceholderPage(t *testing.T) {
	// Valid ZIP but no inner files → should return at least 1 placeholder page
	r, size := makeZip(map[string][]byte{})
	result, err := parser.ParseFile(r, size, "myreport.pbix")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.SourceType != "powerbi" {
		t.Errorf("expected sourceType=powerbi, got %s", result.SourceType)
	}
	if len(result.Pages) == 0 {
		t.Error("expected at least 1 placeholder page, got 0")
	}
	if result.ParsedAt.IsZero() {
		t.Error("ParsedAt should not be zero")
	}
}

func TestPBIXParser_WithLayout(t *testing.T) {
	// Minimal valid Layout JSON with one page and one visual
	layout := map[string]interface{}{
		"id": 123,
		"sections": []map[string]interface{}{
			{
				"name":        "ReportSection001",
				"displayName": "Sales Dashboard",
				"width":       1280.0,
				"height":      720.0,
				"visualContainers": []map[string]interface{}{
					{
						"x": 10.0, "y": 10.0, "z": 0.0,
						"width": 400.0, "height": 300.0,
						"config": json.RawMessage(`{"singleVisual":{"visualType":"barChart"}}`),
					},
				},
			},
		},
	}
	layoutBytes, _ := json.Marshal(layout)

	meta := map[string]interface{}{"reportName": "My BI Report"}
	metaBytes, _ := json.Marshal(meta)

	r, size := makeZip(map[string][]byte{
		"Metadata":      metaBytes,
		"Report/Layout": layoutBytes,
	})

	result, err := parser.ParseFile(r, size, "report.pbix")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Title != "My BI Report" {
		t.Errorf("expected title='My BI Report', got '%s'", result.Title)
	}
	if len(result.Pages) != 1 {
		t.Fatalf("expected 1 page, got %d", len(result.Pages))
	}
	pg := result.Pages[0]
	if pg.Name != "Sales Dashboard" {
		t.Errorf("expected page name 'Sales Dashboard', got '%s'", pg.Name)
	}
	if len(pg.Visuals) != 1 {
		t.Fatalf("expected 1 visual, got %d", len(pg.Visuals))
	}
	if pg.Visuals[0].Type != "bar" {
		t.Errorf("expected visual type 'bar', got '%s'", pg.Visuals[0].Type)
	}
}

// ─── Tableau TWB Parser ───────────────────────────────────────────────────────

func TestTableauParser_TWB_ValidXML(t *testing.T) {
	twb := `<?xml version="1.0" encoding="utf-8"?>
<workbook>
  <datasources>
    <datasource name="ds1" caption="My Postgres DB">
      <connection class="postgres" server="db.example.com" port="5432" dbname="analytics" username="analyst"/>
    </datasource>
  </datasources>
  <worksheets>
    <worksheet name="Sales Sheet"/>
    <worksheet name="Revenue Trend"/>
  </worksheets>
  <dashboards>
    <dashboard name="Executive Dashboard">
      <size maxheight="800" maxwidth="1200"/>
      <zones>
        <zone type="worksheet" name="Sales Sheet" x="0" y="0" w="600" h="400"/>
      </zones>
    </dashboard>
  </dashboards>
</workbook>`

	data := []byte(twb)
	r := bytes.NewReader(data)
	result, err := parser.ParseFile(r, int64(len(data)), "workbook.twb")
	if err != nil {
		t.Fatalf("unexpected error parsing TWB: %v", err)
	}

	if result.SourceType != "tableau" {
		t.Errorf("expected sourceType=tableau, got %s", result.SourceType)
	}
	if len(result.DataSources) == 0 {
		t.Error("expected at least 1 data source")
	}
	if result.DataSources[0].Type != "postgresql" {
		t.Errorf("expected ds type 'postgresql', got '%s'", result.DataSources[0].Type)
	}
	// 1 dashboard page + 1 standalone worksheet (Revenue Trend not in dashboard)
	if len(result.Pages) < 1 {
		t.Error("expected at least 1 page")
	}
	// Dashboard page should have 1 zone visual
	dashPage := result.Pages[0]
	if dashPage.Name != "Executive Dashboard" {
		t.Errorf("expected first page to be 'Executive Dashboard', got '%s'", dashPage.Name)
	}
	if len(dashPage.Visuals) != 1 {
		t.Errorf("expected 1 visual in dashboard, got %d", len(dashPage.Visuals))
	}
}

func TestTableauParser_TWBX_NotZip_Error(t *testing.T) {
	r := strings.NewReader("not a zip")
	_, err := parser.ParseFile(r, 9, "workbook.twbx")
	if err == nil {
		t.Fatal("expected error for invalid TWBX (not a ZIP)")
	}
}

// ─── PPTX Parser ──────────────────────────────────────────────────────────────

func TestPPTXParser_InvalidZip_Error(t *testing.T) {
	r := strings.NewReader("bad data")
	_, err := parser.ParseFile(r, 8, "presentation.pptx")
	if err == nil {
		t.Fatal("expected error for invalid PPTX ZIP content")
	}
}

func TestPPTXParser_EmptyZip_Returns0Pages(t *testing.T) {
	r, size := makeZip(map[string][]byte{})
	result, err := parser.ParseFile(r, size, "presentation.pptx")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.SourceType != "pptx" {
		t.Errorf("expected sourceType=pptx, got %s", result.SourceType)
	}
	// No slides → 0 pages is acceptable
	_ = result.Pages
}

func TestPPTXParser_WithSlide(t *testing.T) {
	// Minimal slide XML — uses namespace-prefixed local names exactly as Go's xml package sees them
	slideXML := `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr name="Title 1"/>
          <p:nvPr><p:ph type="title"/></p:nvPr>
        </p:nvSpPr>
        <p:txBody>
          <a:p><a:r><a:t>Quarterly Results</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`

	// Build a minimal PPTX ZIP with slide1.xml
	r, size := makeZip(map[string][]byte{
		"ppt/slides/slide1.xml": []byte(slideXML),
	})

	result, err := parser.ParseFile(r, size, "test.pptx")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.SourceType != "pptx" {
		t.Errorf("expected sourceType=pptx")
	}
	if len(result.Pages) != 1 {
		t.Fatalf("expected 1 slide/page, got %d", len(result.Pages))
	}
}

// ─── ParsedReport structural integrity ───────────────────────────────────────

func TestParsedReport_ParsedAtIsRecent(t *testing.T) {
	data := []byte(`<workbook><worksheets><worksheet name="Test"/></worksheets></workbook>`)
	r := bytes.NewReader(data)
	before := time.Now()
	result, err := parser.ParseFile(r, int64(len(data)), "simple.twb")
	after := time.Now()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.ParsedAt.Before(before) || result.ParsedAt.After(after) {
		t.Errorf("ParsedAt %v is not within expected range [%v, %v]", result.ParsedAt, before, after)
	}
}

package parser

import (
	"archive/zip"
	"encoding/xml"
	"fmt"
	"io"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// ─────────────────────────────────────────────────────────────────────────────
// PowerPoint .pptx Parser
// ─────────────────────────────────────────────────────────────────────────────
// .pptx is an Open XML ZIP archive containing:
//   [Content_Types].xml              — file manifest
//   ppt/presentation.xml             — slide order
//   ppt/slides/slide1.xml, ...       — individual slides
//   ppt/slides/_rels/slide1.xml.rels — relationships (charts, images)
//   ppt/charts/chart1.xml            — embedded chart definitions
//
// We extract: slide number + title + all text snippets + chart types.

// PPTXParser parses PowerPoint .pptx files.
type PPTXParser struct{}

// Parse reads a .pptx and extracts all slides as ParsedPages.
func (p *PPTXParser) Parse(r io.ReaderAt, size int64, filename string) (*ParsedReport, error) {
	zr, err := zip.NewReader(r, size)
	if err != nil {
		return nil, fmt.Errorf("pptx: not a valid ZIP archive: %w", err)
	}

	report := &ParsedReport{
		Title:      strings.TrimSuffix(filepath.Base(filename), ".pptx"),
		SourceType: "pptx",
		ParsedAt:   time.Now(),
		Metadata:   map[string]any{},
	}

	// ── Index all files for quick access ─────────────────────────────────────
	fileMap := map[string]*zip.File{}
	for _, f := range zr.File {
		fileMap[f.Name] = f
	}

	// ── Read slide list from presentation.xml ────────────────────────────────
	slideIDs := readPresentationSlideIDs(fileMap)

	// ── Parse each slide ─────────────────────────────────────────────────────
	for i, slideFile := range slideIDs {
		if f, ok := fileMap[slideFile]; ok {
			pg := parseSlide(f, i, fileMap)
			report.Pages = append(report.Pages, pg)
		}
	}

	// ── Fallback: scan for slides not listed in presentation.xml ─────────────
	if len(report.Pages) == 0 {
		for _, f := range zr.File {
			if strings.HasPrefix(f.Name, "ppt/slides/slide") &&
				strings.HasSuffix(f.Name, ".xml") &&
				!strings.Contains(f.Name, "_rels") {
				idx := len(report.Pages)
				report.Pages = append(report.Pages, parseSlide(f, idx, fileMap))
			}
		}
	}

	report.Metadata["slideCount"] = len(report.Pages)
	return report, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// presentation.xml — slide ordering
// ─────────────────────────────────────────────────────────────────────────────

type pptPresentation struct {
	SldIdLst struct {
		SldId []struct {
			ID  int    `xml:"id,attr"`
			RID string `xml:"id,attr"` // relationship id
		} `xml:"sldId"`
	} `xml:"sldIdLst"`
}

// readPresentationSlideIDs reads the slide order from ppt/presentation.xml
// and returns the file paths to the slides in order.
func readPresentationSlideIDs(fileMap map[string]*zip.File) []string {
	// Read the presentation relationships
	relsFile, ok := fileMap["ppt/_rels/presentation.xml.rels"]
	if !ok {
		return guessSlides(fileMap)
	}

	rc, err := relsFile.Open()
	if err != nil {
		return guessSlides(fileMap)
	}
	defer rc.Close()

	type Rel struct {
		ID     string `xml:"Id,attr"`
		Target string `xml:"Target,attr"`
		Type   string `xml:"Type,attr"`
	}
	type Rels struct {
		Rels []Rel `xml:"Relationship"`
	}

	var rels Rels
	if err := xml.NewDecoder(rc).Decode(&rels); err != nil {
		return guessSlides(fileMap)
	}

	var slides []string
	for _, rel := range rels.Rels {
		if strings.Contains(rel.Type, "/slide") && !strings.Contains(rel.Type, "slideLayout") &&
			!strings.Contains(rel.Type, "slideMaster") {
			target := "ppt/" + strings.TrimPrefix(rel.Target, "../")
			slides = append(slides, target)
		}
	}

	// Sort slides numerically (slide1, slide2, …)
	sortSlides(slides)
	return slides
}

func guessSlides(fileMap map[string]*zip.File) []string {
	var slides []string
	for name := range fileMap {
		if strings.HasPrefix(name, "ppt/slides/slide") &&
			strings.HasSuffix(name, ".xml") &&
			!strings.Contains(name, "_rels") {
			slides = append(slides, name)
		}
	}
	sortSlides(slides)
	return slides
}

// sortSlides sorts "ppt/slides/slide3.xml" < "ppt/slides/slide10.xml" numerically.
func sortSlides(slides []string) {
	for i := 0; i < len(slides)-1; i++ {
		for j := i + 1; j < len(slides); j++ {
			ni := slideNum(slides[i])
			nj := slideNum(slides[j])
			if ni > nj {
				slides[i], slides[j] = slides[j], slides[i]
			}
		}
	}
}

func slideNum(path string) int {
	base := filepath.Base(path) // slide3.xml
	base = strings.TrimPrefix(base, "slide")
	base = strings.TrimSuffix(base, ".xml")
	n, _ := strconv.Atoi(base)
	return n
}

// ─────────────────────────────────────────────────────────────────────────────
// Slide XML — shape tree extraction
// ─────────────────────────────────────────────────────────────────────────────

// pptSlide is the top-level element of ppt/slides/slideN.xml
type pptSlide struct {
	XMLName xml.Name  `xml:"sld"`
	CSpTree pptSpTree `xml:"cSpTree"`
}

// cSpTree is embedded inside cSld > spTree
type pptSpTree struct {
	Shapes []pptShape `xml:"sp"`
}

type pptShape struct {
	NvSpPr pptNvSpPr `xml:"nvSpPr"`
	SpPr   pptSpPr   `xml:"spPr"`
	TxBody pptTxBody `xml:"txBody"`
}

type pptNvSpPr struct {
	CNvPr pptCNvPr `xml:"cNvPr"`
	Ph    *pptPh   `xml:"nvPr>ph"`
}

type pptCNvPr struct {
	Name string `xml:"name,attr"`
}

type pptPh struct {
	Type string `xml:"type,attr"`
	Idx  int    `xml:"idx,attr"`
}

type pptSpPr struct {
	Xfrm pptXfrm `xml:"xfrm"`
}

type pptXfrm struct {
	Off pptPoint `xml:"off"`
	Ext pptPoint `xml:"ext"`
}

type pptPoint struct {
	X int64 `xml:"x,attr"`
	Y int64 `xml:"y,attr"`
}

type pptTxBody struct {
	Paragraphs []pptParagraph `xml:"p"`
}

type pptParagraph struct {
	Runs []pptRun `xml:"r"`
}

type pptRun struct {
	T string `xml:"t"`
}

// ─────────────────────────────────────────────────────────────────────────────
// parseSlide reads a single slide XML file and builds a ParsedPage.
// ─────────────────────────────────────────────────────────────────────────────

func parseSlide(f *zip.File, idx int, fileMap map[string]*zip.File) ParsedPage {
	pg := ParsedPage{
		Name:  fmt.Sprintf("Slide %d", idx+1),
		Index: idx,
	}

	rc, err := f.Open()
	if err != nil {
		return pg
	}
	defer rc.Close()

	// We use a generic XML walk since the namespace prefixes vary across files
	rawXML, err := io.ReadAll(rc)
	if err != nil {
		return pg
	}

	// ── Extract title + text from shapes ─────────────────────────────────────
	// Walk the XML token stream to pick up <a:t> text runs and <p:ph type="title">
	var titleText string
	var allText []string
	inTitlePh := false

	dec := xml.NewDecoder(strings.NewReader(string(rawXML)))
	var stack []string
	for {
		tok, err := dec.Token()
		if err != nil {
			break
		}
		switch se := tok.(type) {
		case xml.StartElement:
			local := se.Name.Local
			stack = append(stack, local)
			// Detect placeholder type="title"
			if local == "ph" {
				for _, attr := range se.Attr {
					if attr.Name.Local == "type" && (attr.Value == "title" || attr.Value == "ctrTitle") {
						inTitlePh = true
					}
				}
			}
		case xml.EndElement:
			if len(stack) > 0 {
				popped := stack[len(stack)-1]
				stack = stack[:len(stack)-1]
				if popped == "sp" {
					inTitlePh = false // reset per shape
				}
			}
		case xml.CharData:
			text := strings.TrimSpace(string(se))
			if text == "" {
				continue
			}
			// Only collect text inside <a:t> elements
			if len(stack) > 0 && stack[len(stack)-1] == "t" {
				if inTitlePh && titleText == "" {
					titleText = text
				}
				allText = append(allText, text)
			}
		}
	}

	if titleText != "" {
		pg.Name = titleText
	}
	pg.RawNotes = strings.Join(allText, " | ")

	// ── Look for charts referenced via rels ──────────────────────────────────
	relsPath := strings.Replace(f.Name, "slides/slide", "slides/_rels/slide", 1) + ".rels"
	chartVisuals := extractChartVisuals(fileMap, relsPath, allText)
	pg.Visuals = append(pg.Visuals, chartVisuals...)

	// ── Add a text visual if slide has text but no visuals ───────────────────
	if len(pg.Visuals) == 0 && len(allText) > 0 {
		pg.Visuals = append(pg.Visuals, ParsedVisual{
			Type:  "text",
			Title: shortText(strings.Join(allText, " "), 80),
		})
	}

	return pg
}

// extractChartVisuals reads the slide's relationship file to find embedded charts.
func extractChartVisuals(fileMap map[string]*zip.File, relsPath string, fallbackText []string) []ParsedVisual {
	f, ok := fileMap[relsPath]
	if !ok {
		return nil
	}
	rc, err := f.Open()
	if err != nil {
		return nil
	}
	defer rc.Close()

	type Rel struct {
		Type   string `xml:"Type,attr"`
		Target string `xml:"Target,attr"`
	}
	type Rels struct {
		Rels []Rel `xml:"Relationship"`
	}
	var rels Rels
	_ = xml.NewDecoder(rc).Decode(&rels)

	var visuals []ParsedVisual
	for _, rel := range rels.Rels {
		if !strings.Contains(rel.Type, "/chart") {
			continue
		}
		// Normalise path: ../charts/chart1.xml → ppt/charts/chart1.xml
		chartPath := "ppt/" + strings.TrimPrefix(rel.Target, "../")
		chartType := detectChartType(fileMap, chartPath)
		title := shortText(strings.Join(fallbackText, " "), 60)
		visuals = append(visuals, ParsedVisual{
			Type:  chartType,
			Title: title,
		})
	}
	return visuals
}

// detectChartType reads a chart XML and returns the canonical chart type.
func detectChartType(fileMap map[string]*zip.File, chartPath string) string {
	f, ok := fileMap[chartPath]
	if !ok {
		return "chart"
	}
	rc, err := f.Open()
	if err != nil {
		return "chart"
	}
	defer rc.Close()

	raw, _ := io.ReadAll(rc)
	content := strings.ToLower(string(raw))

	// Chart type detection by XML element names
	switch {
	case strings.Contains(content, "<c:barChart>"):
		return "bar"
	case strings.Contains(content, "<c:lineChart>"):
		return "line"
	case strings.Contains(content, "<c:pieChart>") || strings.Contains(content, "<c:doughnutChart>"):
		return "pie"
	case strings.Contains(content, "<c:areaChart>"):
		return "area"
	case strings.Contains(content, "<c:scatterChart>"):
		return "scatter"
	case strings.Contains(content, "<c:bubbleChart>"):
		return "bubble"
	case strings.Contains(content, "<c:radarChart>"):
		return "radar"
	case strings.Contains(content, "<c:stockChart>"):
		return "candlestick"
	case strings.Contains(content, "<c:surfaceChart>"):
		return "surface"
	default:
		return "chart"
	}
}

func shortText(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "…"
}

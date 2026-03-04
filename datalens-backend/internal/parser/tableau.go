package parser

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
	"path/filepath"
	"strings"
	"time"
)

// ─────────────────────────────────────────────────────────────────────────────
// Tableau .twb / .twbx Parser
// ─────────────────────────────────────────────────────────────────────────────
// TWB  — plain XML file          (Tableau Workbook)
// TWBX — ZIP containing TWB XML  (Tableau Packaged Workbook)
//
// Key XML structure:
//   <workbook>
//     <datasources>
//       <datasource name="..." caption="...">
//         <connection class="postgresql" dbname="..." server="..." .../>
//       </datasource>
//     </datasources>
//     <worksheets>
//       <worksheet name="...">
//         <table><view>...</view></table>
//       </worksheet>
//     </worksheets>
//     <dashboards>
//       <dashboard name="...">
//         <size maxheight="..." maxwidth="..."/>
//         <zones><zone type="worksheet" name="Sheet1" x="..." y="..." w="..." h="..."/></zones>
//       </dashboard>
//     </dashboards>
//   </workbook>

// TableauParser parses Tableau TWB/TWBX files.
type TableauParser struct {
	Format string // "twb" | "twbx"
}

// Parse reads a Tableau workbook and extracts sheets, dashboards, data sources.
func (p *TableauParser) Parse(r io.ReaderAt, size int64, filename string) (*ParsedReport, error) {
	var xmlReader io.Reader

	switch strings.ToLower(p.Format) {
	case "twbx":
		// TWBX is a ZIP — find the embedded .twb file
		zr, err := zip.NewReader(r, size)
		if err != nil {
			return nil, fmt.Errorf("twbx: not a valid ZIP archive: %w", err)
		}
		xml, err := findTWBInZip(zr)
		if err != nil {
			return nil, err
		}
		xmlReader = xml
	default:
		// TWB is plain XML — read entire content
		buf := make([]byte, size)
		if _, err := r.ReadAt(buf, 0); err != nil && err != io.EOF {
			return nil, fmt.Errorf("twb: read failed: %w", err)
		}
		xmlReader = bytes.NewReader(buf)
	}

	return parseTableauXML(xmlReader, filename)
}

// findTWBInZip locates the .twb file inside a .twbx ZIP archive.
func findTWBInZip(zr *zip.Reader) (io.Reader, error) {
	for _, f := range zr.File {
		if strings.ToLower(filepath.Ext(f.Name)) == ".twb" {
			rc, err := f.Open()
			if err != nil {
				return nil, fmt.Errorf("twbx: cannot open embedded .twb: %w", err)
			}
			raw, err := io.ReadAll(rc)
			rc.Close()
			if err != nil {
				return nil, err
			}
			return bytes.NewReader(raw), nil
		}
	}
	return nil, fmt.Errorf("twbx: no .twb file found inside the archive")
}

// ─────────────────────────────────────────────────────────────────────────────
// XML structs for Tableau workbook
// ─────────────────────────────────────────────────────────────────────────────

type twbWorkbook struct {
	XMLName     xml.Name        `xml:"workbook"`
	Datasources []twbDatasource `xml:"datasources>datasource"`
	Worksheets  []twbWorksheet  `xml:"worksheets>worksheet"`
	Dashboards  []twbDashboard  `xml:"dashboards>dashboard"`
}

type twbDatasource struct {
	Name       string        `xml:"name,attr"`
	Caption    string        `xml:"caption,attr"`
	Connection twbConnection `xml:"connection"`
}

type twbConnection struct {
	Class    string `xml:"class,attr"` // postgresql, mysql, sqlserver, excel, text, etc.
	DBName   string `xml:"dbname,attr"`
	Server   string `xml:"server,attr"`
	Port     string `xml:"port,attr"`
	Username string `xml:"username,attr"`
	Filename string `xml:"filename,attr"` // for Excel/CSV
}

type twbWorksheet struct {
	Name  string `xml:"name,attr"`
	Table struct {
		View struct {
			Datasources []struct {
				Name    string `xml:"name,attr"`
				Caption string `xml:"caption,attr"`
			} `xml:"datasource"`
		} `xml:"view"`
	} `xml:"table"`
}

type twbDashboard struct {
	Name  string    `xml:"name,attr"`
	Size  twbSize   `xml:"size"`
	Zones []twbZone `xml:"zones>zone"`
}

type twbSize struct {
	MaxHeight float64 `xml:"maxheight,attr"`
	MaxWidth  float64 `xml:"maxwidth,attr"`
}

type twbZone struct {
	Type string  `xml:"type,attr"`
	Name string  `xml:"name,attr"`
	X    float64 `xml:"x,attr"`
	Y    float64 `xml:"y,attr"`
	W    float64 `xml:"w,attr"`
	H    float64 `xml:"h,attr"`
}

// ─────────────────────────────────────────────────────────────────────────────
// parseTableauXML — decode XML → ParsedReport
// ─────────────────────────────────────────────────────────────────────────────

func parseTableauXML(xmlReader io.Reader, filename string) (*ParsedReport, error) {
	raw, err := io.ReadAll(xmlReader)
	if err != nil {
		return nil, fmt.Errorf("tableau: read XML failed: %w", err)
	}

	var workbook twbWorkbook
	if err := xml.Unmarshal(raw, &workbook); err != nil {
		return nil, fmt.Errorf("tableau: XML parse failed: %w", err)
	}

	report := &ParsedReport{
		Title:      strings.TrimSuffix(filepath.Base(filename), filepath.Ext(filename)),
		SourceType: "tableau",
		ParsedAt:   time.Now(),
		Metadata:   map[string]any{},
	}

	// ── Data sources ──────────────────────────────────────────────────────────
	for _, ds := range workbook.Datasources {
		// Skip Tableau internal datasources
		if strings.HasPrefix(ds.Name, "Parameters") || ds.Name == "" {
			continue
		}
		name := ds.Caption
		if name == "" {
			name = ds.Name
		}
		conn := ds.Connection
		connStr := ""
		if conn.Server != "" {
			port := conn.Port
			if port == "" {
				port = defaultPort(conn.Class)
			}
			connStr = fmt.Sprintf("%s:%s/%s", conn.Server, port, conn.DBName)
		} else if conn.Filename != "" {
			connStr = conn.Filename
		}
		report.DataSources = append(report.DataSources, DataSource{
			Name:       name,
			Type:       normalizeTableauClass(conn.Class),
			Connection: connStr,
		})
	}

	// ── Worksheet index for quick lookup ─────────────────────────────────────
	wsIndex := map[string]int{}
	for _, ws := range workbook.Worksheets {
		wsIndex[ws.Name] = 1
	}

	// ── Dashboards → pages ───────────────────────────────────────────────────
	for i, db := range workbook.Dashboards {
		pg := ParsedPage{
			Name:   db.Name,
			Index:  i,
			Width:  db.Size.MaxWidth,
			Height: db.Size.MaxHeight,
		}
		for _, zone := range db.Zones {
			if zone.Type != "worksheet" || zone.Name == "" {
				continue
			}
			pg.Visuals = append(pg.Visuals, ParsedVisual{
				Type:   "chart",
				Title:  zone.Name,
				X:      zone.X,
				Y:      zone.Y,
				Width:  zone.W,
				Height: zone.H,
			})
		}
		report.Pages = append(report.Pages, pg)
	}

	// ── Worksheets not in any dashboard → individual pages ───────────────────
	dashRef := map[string]bool{}
	for _, db := range workbook.Dashboards {
		for _, zone := range db.Zones {
			dashRef[zone.Name] = true
		}
	}
	offset := len(report.Pages)
	for i, ws := range workbook.Worksheets {
		if dashRef[ws.Name] {
			continue // already represented in a dashboard
		}
		report.Pages = append(report.Pages, ParsedPage{
			Name:  ws.Name,
			Index: offset + i,
			Visuals: []ParsedVisual{{
				Type:  "chart",
				Title: ws.Name,
			}},
		})
	}

	report.Metadata["worksheetCount"] = len(workbook.Worksheets)
	report.Metadata["dashboardCount"] = len(workbook.Dashboards)
	report.Metadata["datasourceCount"] = len(report.DataSources)

	return report, nil
}

// normalizeTableauClass maps Tableau connection classes to canonical DB types.
func normalizeTableauClass(class string) string {
	switch strings.ToLower(class) {
	case "postgres", "postgresql":
		return "postgresql"
	case "mysql":
		return "mysql"
	case "sqlserver", "mssqlnative":
		return "mssql"
	case "excel-direct", "excel":
		return "excel"
	case "text", "csv":
		return "csv"
	case "snowflake":
		return "snowflake"
	case "bigquery":
		return "bigquery"
	case "redshift":
		return "redshift"
	case "oracle":
		return "oracle"
	case "databricks":
		return "databricks"
	default:
		if class == "" {
			return "direct"
		}
		return strings.ToLower(class)
	}
}

func defaultPort(class string) string {
	switch strings.ToLower(class) {
	case "postgres", "postgresql":
		return "5432"
	case "mysql":
		return "3306"
	case "sqlserver", "mssqlnative":
		return "1433"
	default:
		return ""
	}
}

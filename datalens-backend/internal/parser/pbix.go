package parser

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"path/filepath"
	"strings"
	"time"
)

// ─────────────────────────────────────────────────────────────────────────────
// Power BI .pbix Parser
// ─────────────────────────────────────────────────────────────────────────────
// .pbix is a ZIP archive containing:
//   Report/Layout          — report page + visual config (JSON, possibly LZ4-compressed)
//   DataModelSchema        — data model definition
//   Metadata               — report metadata JSON
//   SecurityBindings       — RLS definitions
//   Version                — format version

// PBIXParser parses Power BI .pbix files.
type PBIXParser struct{}

// Parse reads a .pbix file and extracts all report pages and visuals.
func (p *PBIXParser) Parse(r io.ReaderAt, size int64, filename string) (*ParsedReport, error) {
	zr, err := zip.NewReader(r, size)
	if err != nil {
		return nil, fmt.Errorf("pbix: not a valid ZIP archive: %w", err)
	}

	report := &ParsedReport{
		Title:      strings.TrimSuffix(filepath.Base(filename), ".pbix"),
		SourceType: "powerbi",
		ParsedAt:   time.Now(),
		Metadata:   map[string]any{},
	}

	for _, f := range zr.File {
		switch f.Name {
		case "Metadata":
			report.Metadata = parsePBIXMetadata(f)
			if title, ok := report.Metadata["reportName"].(string); ok && title != "" {
				report.Title = title
			}
		case "Report/Layout":
			pages, dataSources := parsePBIXLayout(f)
			report.Pages = pages
			report.DataSources = dataSources
		case "DataModelSchema":
			if extra := parsePBIXDataModel(f); len(extra) > 0 {
				report.DataSources = append(report.DataSources, extra...)
			}
		}
	}

	// Fallback: at least 1 placeholder page if nothing extracted
	if len(report.Pages) == 0 {
		report.Pages = []ParsedPage{{Name: "Page 1", Index: 0}}
	}
	return report, nil
}

// ── Metadata ─────────────────────────────────────────────────────────────────

func parsePBIXMetadata(f *zip.File) map[string]any {
	rc, err := f.Open()
	if err != nil {
		return nil
	}
	defer rc.Close()
	var meta map[string]any
	_ = json.NewDecoder(rc).Decode(&meta)
	return meta
}

// ── Layout ───────────────────────────────────────────────────────────────────

// pbiLayout mirrors the top-level JSON structure inside Report/Layout.
type pbiLayout struct {
	ID          int       `json:"id"`
	ReportPages []pbiPage `json:"sections"` // Power BI calls them "sections"
}

type pbiPage struct {
	Name        string      `json:"name"`
	DisplayName string      `json:"displayName"`
	Width       float64     `json:"width"`
	Height      float64     `json:"height"`
	Visuals     []pbiVisual `json:"visualContainers"`
}

type pbiVisual struct {
	X      float64         `json:"x"`
	Y      float64         `json:"y"`
	Z      float64         `json:"z"`
	Width  float64         `json:"width"`
	Height float64         `json:"height"`
	Config json.RawMessage `json:"config"`
}

type pbiVisualConfig struct {
	SingleVisual struct {
		VisualType string `json:"visualType"`
		VcObjects  struct {
			Title []struct {
				Properties struct {
					Text struct {
						Expr struct {
							Literal struct {
								Value string `json:"Value"`
							} `json:"Literal"`
						} `json:"Expr"`
					} `json:"text"`
				} `json:"properties"`
			} `json:"title"`
		} `json:"vcObjects"`
		PrototypeQuery struct {
			Select []struct {
				Column struct {
					Expression struct {
						SourceRef struct {
							Entity string `json:"Entity"`
						} `json:"SourceRef"`
					} `json:"Expression"`
					Property string `json:"Property"`
				} `json:"Column"`
			} `json:"Select"`
		} `json:"prototypeQuery"`
	} `json:"singleVisual"`
}

func parsePBIXLayout(f *zip.File) ([]ParsedPage, []DataSource) {
	rc, err := f.Open()
	if err != nil {
		return nil, nil
	}
	defer rc.Close()

	raw, err := io.ReadAll(rc)
	if err != nil {
		return nil, nil
	}

	// Attempt direct JSON parse (un-compressed layout)
	var layout pbiLayout
	if err := json.Unmarshal(raw, &layout); err != nil {
		// Layout might be LZ4-compressed — return placeholder
		return []ParsedPage{{Name: "Page 1", Index: 0, RawNotes: "Layout compressed — visual extraction limited"}}, nil
	}

	var pages []ParsedPage
	seenEntities := map[string]bool{}

	for i, sec := range layout.ReportPages {
		name := sec.DisplayName
		if name == "" {
			name = sec.Name
		}
		pg := ParsedPage{
			Name:   name,
			Index:  i,
			Width:  sec.Width,
			Height: sec.Height,
		}

		for _, v := range sec.Visuals {
			var cfg pbiVisualConfig
			_ = json.Unmarshal(v.Config, &cfg)

			sv := cfg.SingleVisual
			vtype := canonicalPBIType(sv.VisualType)

			title := ""
			if len(sv.VcObjects.Title) > 0 {
				title = sv.VcObjects.Title[0].Properties.Text.Expr.Literal.Value
				title = strings.Trim(title, "'\"")
			}

			var cols []string
			for _, sel := range sv.PrototypeQuery.Select {
				entity := sel.Column.Expression.SourceRef.Entity
				prop := sel.Column.Property
				if entity != "" {
					seenEntities[entity] = true
				}
				if prop != "" {
					cols = append(cols, prop)
				}
			}

			pg.Visuals = append(pg.Visuals, ParsedVisual{
				Type: vtype, Title: title,
				X: v.X, Y: v.Y, Width: v.Width, Height: v.Height,
				Columns: cols,
			})
		}
		pages = append(pages, pg)
	}

	var dsList []DataSource
	for e := range seenEntities {
		dsList = append(dsList, DataSource{Name: e, Type: "powerbi-model"})
	}
	return pages, dsList
}

// ── DataModelSchema ──────────────────────────────────────────────────────────

type pbiDataModel struct {
	Model struct {
		Tables []struct {
			Name       string `json:"name"`
			Partitions []struct {
				Source struct {
					Type              string `json:"type"`
					Expression        string `json:"expression"`
					ConnectionDetails struct {
						Protocol string `json:"protocol"`
						Address  struct {
							Server   string `json:"server"`
							Database string `json:"database"`
						} `json:"address"`
					} `json:"connectionDetails"`
				} `json:"source"`
			} `json:"partitions"`
		} `json:"tables"`
	} `json:"model"`
}

func parsePBIXDataModel(f *zip.File) []DataSource {
	rc, err := f.Open()
	if err != nil {
		return nil
	}
	defer rc.Close()

	var model pbiDataModel
	_ = json.NewDecoder(rc).Decode(&model)

	var out []DataSource
	seen := map[string]bool{}
	for _, tbl := range model.Model.Tables {
		for _, part := range tbl.Partitions {
			cd := part.Source.ConnectionDetails
			if cd.Address.Server != "" {
				key := cd.Address.Server + "/" + cd.Address.Database
				if !seen[key] {
					seen[key] = true
					out = append(out, DataSource{
						Name:       tbl.Name,
						Type:       normaliseProtocol(cd.Protocol),
						Connection: key,
					})
				}
			}
		}
	}
	return out
}

func normaliseProtocol(p string) string {
	switch strings.ToLower(p) {
	case "sql", "sqlserver":
		return "mssql"
	case "postgresql", "postgres":
		return "postgresql"
	case "mysql":
		return "mysql"
	case "analysis services", "as":
		return "analysis-services"
	default:
		if p == "" {
			return "direct"
		}
		return strings.ToLower(p)
	}
}

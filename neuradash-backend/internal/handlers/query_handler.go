package handlers

import (
	"fmt"
	"strings"

	"datalens/internal/middleware"
	"datalens/internal/models"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

// QueryField represents a requested field which might come from a different dataset.
type QueryField struct {
	DatasetID string `json:"datasetId"`
	Column    string `json:"column"`
	AggFn     string `json:"aggFn"` // count, sum, avg, min, max (optional)
}

// AutoJoinQueryPayload is the incoming body for the auto-join endpoint.
type AutoJoinQueryPayload struct {
	BaseDatasetID string       `json:"baseDatasetId"`
	Fields        []QueryField `json:"fields"`
	Limit         int          `json:"limit"`
	// For simplicity in this Phase, we limit to basic fields and aggregation.
	// Future enhancements can add Filters and Sorts here.
}

// QueryHandler manages cross-dataset SQL queries.
type QueryHandler struct {
	db *gorm.DB
}

func NewQueryHandler(db *gorm.DB) *QueryHandler {
	return &QueryHandler{db: db}
}

// AutoJoinQuery constructs and executes a JOIN query on-the-fly based on defined relationships.
// POST /api/v1/query/auto-join
func (h *QueryHandler) AutoJoinQuery(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var req AutoJoinQueryPayload
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	if req.BaseDatasetID == "" || len(req.Fields) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "baseDatasetId and fields are required"})
	}

	limit := req.Limit
	if limit <= 0 || limit > 500 {
		limit = 100 // default limit
	}

	// 1. Identify all unique datasets involved
	datasetIDs := make(map[string]bool)
	datasetIDs[req.BaseDatasetID] = true
	for _, f := range req.Fields {
		datasetIDs[f.DatasetID] = true
	}

	// Fetch dataset metadata for table names
	var datasets []models.Dataset
	var dsIDList []string
	for id := range datasetIDs {
		dsIDList = append(dsIDList, id)
	}

	if err := h.db.Where("id IN ? AND user_id = ? AND deleted_at IS NULL", dsIDList, userID).Find(&datasets).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch datasets metadata"})
	}

	if len(datasets) != len(datasetIDs) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "One or more datasets not found or access denied"})
	}

	tableMap := make(map[string]string)
	for _, ds := range datasets {
		tableMap[ds.ID] = ds.DataTableName
	}

	// Fetch Calculated Fields (DLX Engine)
	var calcFields []models.CalculatedField
	if err := h.db.Where("dataset_id IN ? AND user_id = ?", dsIDList, userID).Find(&calcFields).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch calculated fields"})
	}

	// Map CalcFields by DatasetID + Name for quick lookup
	calcFieldMap := make(map[string]models.CalculatedField)
	for _, cf := range calcFields {
		key := fmt.Sprintf("%s|%s", cf.DatasetID, cf.Name)
		calcFieldMap[key] = cf
	}

	// 2. Build the SELECT clause
	var selectCols []string
	var groupByCols []string
	hasAgg := false

	for i, f := range req.Fields {
		tableName := tableMap[f.DatasetID]
		colAlias := fmt.Sprintf("col_%d", i) // e.g. col_0, col_1 to avoid collisions
		safeCol := sanitizeIdentifier(f.Column)

		// Check if this field is a Calculated Field
		cfKey := fmt.Sprintf("%s|%s", f.DatasetID, f.Column)
		isCalcField := false
		calcFormula := ""
		if cf, exists := calcFieldMap[cfKey]; exists {
			isCalcField = true
			// Basic security: remove semicolons and comments to prevent basic injection
			// A robust engine would parse the AST, but this is V1
			calcFormula = strings.ReplaceAll(cf.Formula, ";", "")
			calcFormula = strings.ReplaceAll(calcFormula, "--", "")
		}

		if f.AggFn != "" {
			hasAgg = true
			agg := ""
			switch f.AggFn {
			case "sum", "avg", "min", "max", "count":
				agg = strings.ToUpper(f.AggFn)
			default:
				agg = "COUNT"
			}

			if isCalcField {
				// E.g. SUM( (sales * 2) ) AS col_0
				selectCols = append(selectCols, fmt.Sprintf(`%s((%s)) AS "%s"`, agg, calcFormula, colAlias))
			} else {
				// Cast to numeric for agg functions other than count
				if agg == "COUNT" {
					selectCols = append(selectCols, fmt.Sprintf(`%s("%s"."%s") AS "%s"`, agg, tableName, safeCol, colAlias))
				} else {
					selectCols = append(selectCols, fmt.Sprintf(`%s("%s"."%s"::numeric) AS "%s"`, agg, tableName, safeCol, colAlias))
				}
			}
		} else {
			if isCalcField {
				selectCols = append(selectCols, fmt.Sprintf(`(%s) AS "%s"`, calcFormula, colAlias))
				groupByCols = append(groupByCols, fmt.Sprintf(`(%s)`, calcFormula))
			} else {
				selectCols = append(selectCols, fmt.Sprintf(`"%s"."%s" AS "%s"`, tableName, safeCol, colAlias))
				groupByCols = append(groupByCols, fmt.Sprintf(`"%s"."%s"`, tableName, safeCol))
			}
		}
	}

	selectClause := strings.Join(selectCols, ", ")

	// 3. Build the FROM and JOIN clauses (Simple 1-hop joining for now)
	baseTable := tableMap[req.BaseDatasetID]
	fromClause := fmt.Sprintf(`FROM "%s"`, baseTable)
	var joins []string

	if len(datasetIDs) > 1 {
		// We need to fetch relationships to construct joins
		var rels []models.DataRelationship
		if err := h.db.Where("user_id = ?", userID).Find(&rels).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch relationships"})
		}

		// Connect base dataset to others
		for targetDsID, targetTableName := range tableMap {
			if targetDsID == req.BaseDatasetID {
				continue
			}

			// Find relationship
			var matchedRel *models.DataRelationship
			for _, r := range rels {
				if (r.SourceDatasetID == req.BaseDatasetID && r.TargetDatasetID == targetDsID) ||
					(r.SourceDatasetID == targetDsID && r.TargetDatasetID == req.BaseDatasetID) {
					matchedRel = &r
					break
				}
			}

			if matchedRel == nil {
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
					"error": fmt.Sprintf("No defined relationship found between %s and %s", req.BaseDatasetID, targetDsID),
				})
			}

			// Construct JOIN
			if matchedRel.SourceDatasetID == req.BaseDatasetID {
				// Base is Source
				joins = append(joins, fmt.Sprintf(`LEFT JOIN "%s" ON "%s"."%s" = "%s"."%s"`,
					targetTableName, baseTable, sanitizeIdentifier(matchedRel.SourceColumn),
					targetTableName, sanitizeIdentifier(matchedRel.TargetColumn)))
			} else {
				// Base is Target
				joins = append(joins, fmt.Sprintf(`LEFT JOIN "%s" ON "%s"."%s" = "%s"."%s"`,
					targetTableName, baseTable, sanitizeIdentifier(matchedRel.TargetColumn),
					targetTableName, sanitizeIdentifier(matchedRel.SourceColumn)))
			}
		}
	}

	joinClause := strings.Join(joins, " ")

	groupByClause := ""
	if hasAgg && len(groupByCols) > 0 {
		groupByClause = "GROUP BY " + strings.Join(groupByCols, ", ")
	}

	limitClause := fmt.Sprintf("LIMIT %d", limit)

	// Final Query Assembly
	finalQuery := strings.TrimSpace(fmt.Sprintf(`SELECT %s %s %s %s %s`,
		selectClause, fromClause, joinClause, groupByClause, limitClause))

	// Execute
	var results []map[string]interface{}
	if err := h.db.Raw(finalQuery).Scan(&results).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to execute auto-join query",
			"details": err.Error(),
		})
	}

	// Map results back to requested column names instead of col_0, col_1 for charting friendliness
	mappedResults := make([]map[string]interface{}, 0, len(results))
	for _, row := range results {
		mappedRow := make(map[string]interface{})
		for i, f := range req.Fields {
			alias := fmt.Sprintf("col_%d", i)

			// If it's an aggregation, the output key might need to reflect that, but for now
			// we just return the raw column name or a compound name if needed.
			// Let's use the format "datasetId.column" or just "column" if it's base.
			key := f.Column
			if f.DatasetID != req.BaseDatasetID {
				key = fmt.Sprintf("%s.%s", f.DatasetID, f.Column) // disambiguate
			}

			// If there's an aggregation, maybe append it
			if f.AggFn != "" {
				key = fmt.Sprintf("%s(%s)", f.AggFn, key)
			}

			mappedRow[key] = row[alias]
		}
		mappedResults = append(mappedResults, mappedRow)
	}

	return c.JSON(fiber.Map{
		"data":  mappedResults,
		"query": finalQuery, // For debugging in frontend
	})
}

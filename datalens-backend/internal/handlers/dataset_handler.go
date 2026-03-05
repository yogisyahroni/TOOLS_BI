package handlers

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	"unicode"

	"datalens/internal/middleware"
	"datalens/internal/models"
	"datalens/internal/storage"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	excelize "github.com/xuri/excelize/v2"
	"gorm.io/gorm"
)

// DatasetHandler handles dataset upload, query, and management.
type DatasetHandler struct {
	db      *gorm.DB
	storage storage.FileStorage
	rdb     *redis.Client // PERF-07: Redis for stats caching
}

// NewDatasetHandler creates a new DatasetHandler.
func NewDatasetHandler(db *gorm.DB, stor storage.FileStorage, rdb *redis.Client) *DatasetHandler {
	return &DatasetHandler{db: db, storage: stor, rdb: rdb}
}

// ListDatasets returns all datasets for the authenticated user.
// GET /api/v1/datasets
func (h *DatasetHandler) ListDatasets(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 20)
	if limit > 100 {
		limit = 100
	}
	offset := (page - 1) * limit

	var datasets []models.Dataset
	var total int64

	q := h.db.Where("user_id = ? AND deleted_at IS NULL", userID)
	q.Model(&models.Dataset{}).Count(&total)
	if err := q.Offset(offset).Limit(limit).Order("created_at desc").Find(&datasets).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch datasets"})
	}

	return c.JSON(fiber.Map{
		"data":  datasets,
		"total": total,
		"page":  page,
		"limit": limit,
	})
}

// UploadDataset parses and stores a CSV or Excel file.
// POST /api/v1/datasets/upload
func (h *DatasetHandler) UploadDataset(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	fileHeader, err := c.FormFile("file")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "File is required"})
	}

	// Limit uploads to 100MB
	if fileHeader.Size > 100*1024*1024 {
		return c.Status(fiber.StatusRequestEntityTooLarge).JSON(fiber.Map{"error": "File too large (max 100MB)"})
	}

	file, err := fileHeader.Open()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to open file"})
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
	if ext != ".csv" && ext != ".xlsx" && ext != ".xls" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Only CSV and Excel files are supported"})
	}

	// Parse file into rows
	var headers []string
	var rows [][]string

	if ext == ".csv" {
		headers, rows, err = parseCSV(file)
	} else {
		// Read all bytes first (excelize needs seekable reader)
		rawBytes, readErr := io.ReadAll(file)
		if readErr != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to read file"})
		}
		headers, rows, err = parseExcel(rawBytes)
	}
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": "Failed to parse file: " + err.Error()})
	}
	if len(headers) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "File has no columns"})
	}

	// Detect column types
	columnDefs := detectColumnTypes(headers, rows)

	// Upload raw file to storage
	storageKey := fmt.Sprintf("uploads/%s/%s%s", userID, uuid.New().String(), ext)
	fileSeeker, _ := fileHeader.Open()
	if err := h.storage.Upload(c.Context(), storageKey, fileSeeker, fileHeader.Size, "application/octet-stream"); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to store file"})
	}

	// Create dynamic PostgreSQL table for this dataset
	datasetID := uuid.New().String()
	tableName := sanitizeTableName(datasetID)

	if err := createDynamicTable(h.db, tableName, columnDefs); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create data table"})
	}

	// Bulk insert rows using PostgreSQL-compatible $N placeholders
	if err := bulkInsertRows(h.db, tableName, headers, rows); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to insert data"})
	}

	// Build dataset name from file name
	datasetName := c.FormValue("name")
	if datasetName == "" {
		datasetName = strings.TrimSuffix(fileHeader.Filename, ext)
	}

	// Serialize column defs using proper json.Marshal (BUG-10 fix)
	colJSON, jsonErr := encodeColumns(columnDefs)
	if jsonErr != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to encode columns"})
	}

	datasetRecord := models.Dataset{
		ID:            datasetID,
		UserID:        userID,
		Name:          datasetName,
		FileName:      fileHeader.Filename,
		Columns:       colJSON,
		RowCount:      len(rows),
		SizeBytes:     fileHeader.Size,
		StorageKey:    storageKey,
		DataTableName: tableName,
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}

	if err := h.db.Create(&datasetRecord).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save dataset"})
	}

	return c.Status(fiber.StatusCreated).JSON(datasetRecord)
}

// GetDataset returns dataset metadata.
// GET /api/v1/datasets/:id
func (h *DatasetHandler) GetDataset(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	id := c.Params("id")

	var ds models.Dataset
	if err := h.db.Where("id = ? AND user_id = ? AND deleted_at IS NULL", id, userID).First(&ds).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Dataset not found"})
	}

	return c.JSON(ds)
}

// QueryDatasetData returns paginated, filtered, sorted data rows.
// GET /api/v1/datasets/:id/data
func (h *DatasetHandler) QueryDatasetData(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	id := c.Params("id")

	var ds models.Dataset
	if err := h.db.Where("id = ? AND user_id = ? AND deleted_at IS NULL", id, userID).First(&ds).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Dataset not found"})
	}

	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 50)
	if limit > 500 {
		limit = 500
	}
	offset := (page - 1) * limit

	// BUG-08 fix: support both 'sortBy'/'sortDir' (backend convention) and 'sort'/'order' (frontend alias)
	sortCol := c.Query("sortBy", c.Query("sort", ""))
	sortDir := c.Query("sortDir", c.Query("order", "asc"))
	if sortDir != "asc" && sortDir != "desc" {
		sortDir = "asc"
	}

	// Build base query on dynamic table
	query := h.db.Table(ds.DataTableName)

	// Apply RLS filters
	rlsFilters := middleware.GetRLSFilters(c)
	if len(rlsFilters) > 0 {
		whereClause, args := middleware.BuildRLSWhereClause(rlsFilters)
		if whereClause != "" {
			query = query.Where(whereClause, args...)
		}
	}

	// Count total
	var total int64
	query.Count(&total)

	// Apply sort
	if sortCol != "" {
		query = query.Order(fmt.Sprintf(`"%s" %s`, sanitizeIdentifier(sortCol), sortDir))
	}

	// Fetch rows
	var rows []map[string]interface{}
	if err := query.Offset(offset).Limit(limit).Find(&rows).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Query failed"})
	}

	return c.JSON(fiber.Map{
		"data":  rows,
		"total": total,
		"page":  page,
		"limit": limit,
	})
}

// GetDatasetStats returns per-column statistics computed via SQL aggregation.
// PERF-03 fix: uses DB-level aggregation instead of loading all rows into RAM.
// PERF-07 fix: results are cached in Redis for 5 minutes to avoid repeated full-scan queries.
// GET /api/v1/datasets/:id/stats
func (h *DatasetHandler) GetDatasetStats(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	id := c.Params("id")

	var ds models.Dataset
	if err := h.db.Where("id = ? AND user_id = ? AND deleted_at IS NULL", id, userID).First(&ds).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Dataset not found"})
	}

	// PERF-07: Check Redis cache first (TTL 5 minutes)
	ctx := context.Background()
	cacheKey := fmt.Sprintf("stats:%s", id)
	if h.rdb != nil {
		if cached, err := h.rdb.Get(ctx, cacheKey).Bytes(); err == nil {
			c.Set("X-Cache", "HIT")
			c.Set("Content-Type", "application/json")
			return c.Send(cached)
		}
	}

	// Decode column definitions to know column names and types
	var colDefs []models.ColumnDef
	if err := json.Unmarshal(ds.Columns, &colDefs); err != nil || len(colDefs) == 0 {
		return c.JSON(map[string]interface{}{})
	}

	stats := map[string]interface{}{}

	for _, col := range colDefs {
		safeCol := sanitizeIdentifier(col.Name)
		quoted := fmt.Sprintf(`"%s"`, safeCol)

		colStat := map[string]interface{}{
			"totalCount": ds.RowCount,
		}

		// Common stats for all types: null count, distinct count
		type basicStats struct {
			NullCount     int64 `gorm:"column:null_count"`
			DistinctCount int64 `gorm:"column:distinct_count"`
		}
		var basic basicStats
		h.db.Raw(fmt.Sprintf(
			`SELECT COUNT(*) FILTER (WHERE %s IS NULL) AS null_count, COUNT(DISTINCT %s) AS distinct_count FROM "%s"`,
			quoted, quoted, ds.DataTableName,
		)).Scan(&basic)
		colStat["nullCount"] = basic.NullCount
		colStat["distinctCount"] = basic.DistinctCount

		// Numeric-specific stats
		if col.Type == "number" {
			type numStats struct {
				Min    *float64 `gorm:"column:min_val"`
				Max    *float64 `gorm:"column:max_val"`
				Avg    *float64 `gorm:"column:avg_val"`
				Stddev *float64 `gorm:"column:stddev_val"`
				Sum    *float64 `gorm:"column:sum_val"`
			}
			var ns numStats
			h.db.Raw(fmt.Sprintf(
				`SELECT MIN(%s::double precision) AS min_val, MAX(%s::double precision) AS max_val,
				        AVG(%s::double precision) AS avg_val, STDDEV(%s::double precision) AS stddev_val,
				        SUM(%s::double precision) AS sum_val FROM "%s"`,
				quoted, quoted, quoted, quoted, quoted, ds.DataTableName,
			)).Scan(&ns)
			if ns.Min != nil {
				colStat["min"] = *ns.Min
			}
			if ns.Max != nil {
				colStat["max"] = *ns.Max
			}
			if ns.Avg != nil {
				colStat["avg"] = *ns.Avg
			}
			if ns.Stddev != nil {
				colStat["stddev"] = *ns.Stddev
			}
			if ns.Sum != nil {
				colStat["sum"] = *ns.Sum
			}
		}

		stats[col.Name] = colStat
	}

	// PERF-07: Marshal result and cache in Redis (5 min TTL)
	if h.rdb != nil {
		if jsonBytes, err := json.Marshal(stats); err == nil {
			_ = h.rdb.Set(ctx, cacheKey, jsonBytes, 5*time.Minute).Err()
		}
	}

	c.Set("X-Cache", "MISS")
	return c.JSON(stats)
}

// DeleteDataset soft-deletes a dataset and drops the dynamic table.
// DELETE /api/v1/datasets/:id
func (h *DatasetHandler) DeleteDataset(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	id := c.Params("id")

	var ds models.Dataset
	if err := h.db.Where("id = ? AND user_id = ? AND deleted_at IS NULL", id, userID).First(&ds).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Dataset not found"})
	}

	now := time.Now()
	if err := h.db.Model(&ds).Update("deleted_at", now).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete dataset"})
	}

	// PERF-07: Invalidate stats cache when dataset is deleted
	if h.rdb != nil {
		_ = h.rdb.Del(context.Background(), fmt.Sprintf("stats:%s", id)).Err()
	}

	// Drop dynamic data table asynchronously
	go func() {
		_ = h.db.Exec(fmt.Sprintf(`DROP TABLE IF EXISTS "%s"`, ds.DataTableName)).Error
	}()

	return c.Status(fiber.StatusNoContent).Send(nil)
}

// UpdateRefreshConfig sets the refresh schedule for a dataset.
// PUT /api/v1/datasets/:id/refresh-config
func (h *DatasetHandler) UpdateRefreshConfig(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	id := c.Params("id")

	var ds models.Dataset
	if err := h.db.Where("id = ? AND user_id = ? AND deleted_at IS NULL", id, userID).First(&ds).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Dataset not found"})
	}

	var body struct {
		RefreshConfig interface{} `json:"refreshConfig"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	if err := h.db.Model(&ds).Update("refresh_config", body.RefreshConfig).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update refresh config"})
	}

	return c.JSON(ds)
}

// --- File Parsing Helpers ---

func parseCSV(r io.Reader) (headers []string, rows [][]string, err error) {
	reader := csv.NewReader(r)
	reader.LazyQuotes = true
	reader.TrimLeadingSpace = true

	headers, err = reader.Read()
	if err != nil {
		return nil, nil, fmt.Errorf("failed to read CSV header: %w", err)
	}

	rows, err = reader.ReadAll()
	return
}

// parseExcel parses an Excel file (.xlsx or .xls) from raw bytes.
// BUG-01 fix: fully implemented using github.com/xuri/excelize/v2.
func parseExcel(data []byte) (headers []string, rows [][]string, err error) {
	f, err := excelize.OpenReader(bytes.NewReader(data))
	if err != nil {
		return nil, nil, fmt.Errorf("failed to open Excel file: %w", err)
	}
	defer f.Close()

	sheets := f.GetSheetList()
	if len(sheets) == 0 {
		return nil, nil, fmt.Errorf("Excel file has no sheets")
	}

	allRows, err := f.GetRows(sheets[0])
	if err != nil {
		return nil, nil, fmt.Errorf("failed to read Excel sheet '%s': %w", sheets[0], err)
	}

	if len(allRows) == 0 {
		return nil, nil, fmt.Errorf("Excel sheet is empty")
	}

	headers = allRows[0]
	if len(allRows) > 1 {
		rows = allRows[1:]
	}
	return headers, rows, nil
}

func detectColumnTypes(headers []string, rows [][]string) []models.ColumnDef {
	defs := make([]models.ColumnDef, len(headers))
	for i, h := range headers {
		def := models.ColumnDef{Name: h, Type: "string", Nullable: false}
		sampleVals := make([]interface{}, 0, 3)

		numericCount := 0
		dateCount := 0
		nullCount := 0
		totalSamples := len(rows)
		if totalSamples > 100 {
			totalSamples = 100
		}

		for j := 0; j < totalSamples && j < len(rows); j++ {
			if i >= len(rows[j]) {
				nullCount++
				continue
			}
			val := strings.TrimSpace(rows[j][i])
			if val == "" {
				nullCount++
				continue
			}
			if _, err := strconv.ParseFloat(val, 64); err == nil {
				numericCount++
			}
			if isDateLike(val) {
				dateCount++
			}
			if len(sampleVals) < 3 {
				sampleVals = append(sampleVals, val)
			}
		}

		def.Nullable = nullCount > 0
		def.SampleVals = sampleVals

		threshold := totalSamples - nullCount
		if threshold <= 0 {
			threshold = 1
		}
		if numericCount >= threshold/2 {
			def.Type = "number"
		} else if dateCount >= threshold/2 {
			def.Type = "date"
		}

		defs[i] = def
	}
	return defs
}

func isDateLike(s string) bool {
	formats := []string{"2006-01-02", "01/02/2006", "02-01-2006", "2006/01/02"}
	for _, f := range formats {
		if _, err := time.Parse(f, s); err == nil {
			return true
		}
	}
	return false
}

func sanitizeTableName(id string) string {
	return "ds_" + strings.ReplaceAll(id, "-", "_")
}

func sanitizeIdentifier(s string) string {
	var result strings.Builder
	for _, r := range s {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '_' {
			result.WriteRune(r)
		} else {
			result.WriteRune('_')
		}
	}
	return result.String()
}

func createDynamicTable(db *gorm.DB, tableName string, cols []models.ColumnDef) error {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf(`CREATE TABLE IF NOT EXISTS "%s" (`, tableName))
	sb.WriteString(`"_row_id" BIGSERIAL PRIMARY KEY, `)
	for i, col := range cols {
		pgType := "TEXT"
		switch col.Type {
		case "number":
			pgType = "DOUBLE PRECISION"
		case "date":
			pgType = "TIMESTAMPTZ"
		}
		sb.WriteString(fmt.Sprintf(`"%s" %s`, sanitizeIdentifier(col.Name), pgType))
		if i < len(cols)-1 {
			sb.WriteString(", ")
		}
	}
	sb.WriteString(")")
	return db.Exec(sb.String()).Error
}

// bulkInsertRows inserts rows in batches using PostgreSQL-native $N placeholders.
// BUG-02 fix: replaced `?` with `$N` numbering required by the pq/pgx drivers.
func bulkInsertRows(db *gorm.DB, tableName string, headers []string, rows [][]string) error {
	if len(rows) == 0 {
		return nil
	}

	// Sanitized column names
	cols := make([]string, len(headers))
	for i, h := range headers {
		cols[i] = `"` + sanitizeIdentifier(h) + `"`
	}
	colClause := strings.Join(cols, ", ")

	batchSize := 500
	for batchStart := 0; batchStart < len(rows); batchStart += batchSize {
		end := batchStart + batchSize
		if end > len(rows) {
			end = len(rows)
		}
		batch := rows[batchStart:end]

		var sb strings.Builder
		sb.WriteString(fmt.Sprintf(`INSERT INTO "%s" (%s) VALUES `, tableName, colClause))

		args := make([]interface{}, 0, len(batch)*len(headers))
		paramIdx := 1 // PostgreSQL parameter counter: $1, $2, ...

		for rowIdx, row := range batch {
			sb.WriteString("(")
			for colIdx := range headers {
				if colIdx > 0 {
					sb.WriteString(", ")
				}
				// BUG-02 fix: use $N instead of ?
				sb.WriteString(fmt.Sprintf("$%d", paramIdx))
				paramIdx++
				if colIdx < len(row) {
					v := strings.TrimSpace(row[colIdx])
					if v == "" {
						args = append(args, nil)
					} else {
						args = append(args, v)
					}
				} else {
					args = append(args, nil)
				}
			}
			sb.WriteString(")")
			if rowIdx < len(batch)-1 {
				sb.WriteString(", ")
			}
		}

		if err := db.Exec(sb.String(), args...).Error; err != nil {
			return fmt.Errorf("batch insert failed at row %d: %w", batchStart, err)
		}
	}
	return nil
}

func computeColumnStat(col string, rows []map[string]interface{}) map[string]interface{} {
	var numericVals []float64
	nullCount := 0
	distinctVals := map[interface{}]bool{}

	for _, row := range rows {
		val := row[col]
		if val == nil || val == "" {
			nullCount++
			continue
		}
		distinctVals[fmt.Sprintf("%v", val)] = true
		switch v := val.(type) {
		case float64:
			numericVals = append(numericVals, v)
		case int64:
			numericVals = append(numericVals, float64(v))
		case string:
			if f, err := strconv.ParseFloat(v, 64); err == nil {
				numericVals = append(numericVals, f)
			}
		}
	}

	stat := map[string]interface{}{
		"nullCount":     nullCount,
		"distinctCount": len(distinctVals),
		"totalCount":    len(rows),
	}

	if len(numericVals) > 0 {
		minVal := numericVals[0]
		maxVal := numericVals[0]
		sum := 0.0
		for _, v := range numericVals {
			if v < minVal {
				minVal = v
			}
			if v > maxVal {
				maxVal = v
			}
			sum += v
		}
		avg := sum / float64(len(numericVals))

		variance := 0.0
		for _, v := range numericVals {
			diff := v - avg
			variance += diff * diff
		}
		variance /= float64(len(numericVals))

		stat["min"] = minVal
		stat["max"] = maxVal
		stat["avg"] = avg
		stat["stddev"] = math.Sqrt(variance)
		stat["sum"] = sum
	}

	return stat
}

// encodeColumns serializes column definitions to JSON.
// BUG-10 fix: uses encoding/json.Marshal instead of manual fmt.Sprintf
// to properly handle special characters in column names.
func encodeColumns(cols []models.ColumnDef) ([]byte, error) {
	type exportDef struct {
		Name     string `json:"name"`
		Type     string `json:"type"`
		Nullable bool   `json:"nullable"`
	}
	out := make([]exportDef, len(cols))
	for i, c := range cols {
		out[i] = exportDef{Name: c.Name, Type: c.Type, Nullable: c.Nullable}
	}
	return json.Marshal(out)
}

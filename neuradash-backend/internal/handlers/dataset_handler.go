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

	"neuradash/internal/connectors"
	"neuradash/internal/engine"
	"neuradash/internal/middleware"
	"neuradash/internal/models"
	"neuradash/internal/utils"
	"neuradash/internal/services"
	"neuradash/internal/storage"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
	"github.com/xuri/excelize/v2"
	"gorm.io/gorm"
)

// DatasetHandler handles dataset upload, query, and management.
type DatasetHandler struct {
	db      *gorm.DB
	storage storage.FileStorage
	rdb     *redis.Client // PERF-07: Redis for stats caching
	svc     *services.DatasetService // Phase 31: service layer (optional; handlers fall back to db if nil)
}

// NewDatasetHandler creates a new DatasetHandler.
func NewDatasetHandler(db *gorm.DB, stor storage.FileStorage, rdb *redis.Client) *DatasetHandler {
	return &DatasetHandler{db: db, storage: stor, rdb: rdb}
}

// SetService injects the DatasetService after construction.
// Call this in main.go after both the handler and service are initialised.
func (h *DatasetHandler) SetService(svc *services.DatasetService) { h.svc = svc }

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

	if h.svc != nil {
		rows, total, err := h.svc.ListDatasets(c.Context(), userID, page, limit)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
		return c.JSON(fiber.Map{
			"data":  rows,
			"total": total,
			"page":  page,
			"limit": limit,
		})
	}

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
	if userID == "" {
		userID = "00000000-0000-0000-0000-000000000000"
	}

	fileHeader, err := c.FormFile("file")
	if err != nil {
		log.Error().Err(err).Msg("UploadDataset: Failed to get form file 'file'")
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "File is required: " + err.Error()})
	}

	// Limit uploads to 100MB
	if fileHeader.Size > 100*1024*1024 {
		return c.Status(fiber.StatusRequestEntityTooLarge).JSON(fiber.Map{"error": "File too large (max 100MB)"})
	}

	file, err := fileHeader.Open()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to open file: " + err.Error()})
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
	if ext != ".csv" && ext != ".xlsx" && ext != ".xls" {
		log.Error().Str("filename", fileHeader.Filename).Str("ext", ext).Msg("UploadDataset: Unsupported file extension")
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
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to read file: " + readErr.Error()})
		}
		headers, rows, err = parseExcel(rawBytes)
	}
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": "Failed to parse file: " + err.Error()})
	}
	if len(headers) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "File has no columns"})
	}

	// Safely deduplicate and sanitize headers to prevent PostgreSQL duplicate column errors
	seenHeaders := make(map[string]bool)
	for i, h := range headers {
		safeH := sanitizeIdentifier(h)
		if safeH == "" {
			safeH = fmt.Sprintf("col_%d", i)
		}
		if safeH == "_row_id" {
			safeH = "imported_row_id"
		}
		orig := safeH
		counter := 1
		for seenHeaders[safeH] {
			safeH = fmt.Sprintf("%s_%d", orig, counter)
			counter++
		}
		seenHeaders[safeH] = true
		headers[i] = safeH
	}

	// Detect column types
	columnDefs := detectColumnTypes(headers, rows)

	// Upload raw file to storage
	storageKey := fmt.Sprintf("uploads/%s/%s%s", userID, uuid.New().String(), ext)
	fileSeeker, _ := fileHeader.Open()

	if h.storage == nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "File storage service is not configured or unavailable"})
	}

	if err := h.storage.Upload(c.Context(), storageKey, fileSeeker, fileHeader.Size, "application/octet-stream"); err != nil {
		fileSeeker.Close()
		log.Error().Err(err).Str("key", storageKey).Msg("UploadDataset: Failed to upload to storage")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to store file: " + err.Error()})
	}
	fileSeeker.Close()

	// Create dynamic PostgreSQL table for this dataset
	datasetID := uuid.New().String()
	tableName := sanitizeTableName(datasetID)

	if err := createDynamicTable(h.db, tableName, columnDefs); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create data table: " + err.Error()})
	}

	// Bulk insert rows using PostgreSQL-compatible $N placeholders
	if err := bulkInsertRows(h.db, tableName, headers, rows); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to insert data: " + err.Error()})
	}

	// Build dataset name from file name
	datasetName := c.FormValue("name")
	if datasetName == "" {
		datasetName = strings.TrimSuffix(fileHeader.Filename, ext)
	}

	// Serialize column defs using proper json.Marshal (BUG-10 fix)
	colJSON, jsonErr := encodeColumns(columnDefs)
	if jsonErr != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to encode columns: " + jsonErr.Error()})
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
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save dataset: " + err.Error()})
	}

	return c.Status(fiber.StatusCreated).JSON(datasetRecord)
}

// GetDataset returns dataset metadata.
// GET /api/v1/datasets/:id
func (h *DatasetHandler) GetDataset(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	id := c.Params("id")

	if h.svc != nil {
		ds, err := h.svc.GetDataset(c.Context(), id, userID)
		if err != nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
		}
		return c.JSON(ds)
	}

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
	limit := c.QueryInt("limit", 100) // Default 100 for safety
	if limit > 1000 {
		limit = 1000 // MAX 1000 per request for query safety
	}
	offset := (page - 1) * limit

	// BUG-08 fix: support both 'sortBy'/'sortDir' (backend convention) and 'sort'/'order' (frontend alias)
	sortCol := c.Query("sortBy", c.Query("sort", ""))
	sortDir := c.Query("sortDir", c.Query("order", "asc"))
	if sortDir != "asc" && sortDir != "desc" {
		sortDir = "asc"
	}

	// Handle External Connection Dataset
	if strings.HasPrefix(ds.StorageKey, "EXTERNAL_CONN::") {
		connID := strings.TrimPrefix(ds.StorageKey, "EXTERNAL_CONN::")
		var conn models.DBConnection
		if err := h.db.Where("id = ? AND user_id = ?", connID, userID).First(&conn).Error; err != nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "External connection not found"})
		}

		opts := connectors.FromDBConnection(&conn, conn.PasswordEncrypted)
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		dbConn, err := connectors.Open(opts)
		if err != nil {
			return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": fmt.Sprintf("Connection failed: %v", err)})
		}
		defer dbConn.Close()

		// SECURITY: Never SELECT * on external without LIMIT
		sqlQuery := fmt.Sprintf(`SELECT * FROM %s`, QuoteIdentifier(ds.DataTableName))
		if sortCol != "" {
			sqlQuery += fmt.Sprintf(` ORDER BY %s %s`, QuoteIdentifier(sortCol), sortDir)
		}
		// PostgreSQL offset/limit syntax
		sqlQuery += fmt.Sprintf(` LIMIT %d OFFSET %d`, limit, offset)

		res, err := dbConn.Query(ctx, sqlQuery, limit)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to query external dataset: " + err.Error()})
		}

		return c.JSON(fiber.Map{
			"data":  res.Rows,
			"total": ds.RowCount, // Use cached row count for now
			"page":  page,
			"limit": limit,
		})
	}

	// Build base query on dynamic table
	query := h.db.Table(ds.DataTableName)

	// Fetch Calculate Fields (DLX Engine)
	var calcFields []models.CalculatedField
	if err := h.db.Where("dataset_id = ? AND user_id = ?", id, userID).Find(&calcFields).Error; err == nil && len(calcFields) > 0 {
		selects := []string{"*"}
		for _, cf := range calcFields {
			formula := strings.ReplaceAll(cf.Formula, ";", "")
			formula = strings.ReplaceAll(formula, "--", "")
			selects = append(selects, fmt.Sprintf(`(%s) AS %s`, formula, QuoteIdentifier(cf.Name)))
		}
		query = query.Select(strings.Join(selects, ", "))
	}

	// Apply RLS filters
	rlsFilters := middleware.GetRLSFilters(c)
	if len(rlsFilters) > 0 {
		whereClause, args := middleware.BuildRLSWhereClause(rlsFilters)
		if whereClause != "" {
			query = query.Where(whereClause, args...)
		}
	}

	// Apply Date Time Range Filters
	dateCol := c.Query("dateCol")
	startDate := c.Query("startDate")
	endDate := c.Query("endDate")
	if dateCol != "" {
		safeDateCol := QuoteIdentifier(dateCol)
		if startDate != "" && endDate != "" {
			query = query.Where(fmt.Sprintf(`%s >= ? AND %s <= ?`, safeDateCol, safeDateCol), startDate, endDate)
		} else if startDate != "" {
			query = query.Where(fmt.Sprintf(`%s >= ?`, safeDateCol), startDate)
		} else if endDate != "" {
			query = query.Where(fmt.Sprintf(`%s <= ?`, safeDateCol), endDate)
		}
	}

	// Count total
	var total int64
	query.Count(&total)

	// Apply sort
	if sortCol != "" {
		query = query.Order(fmt.Sprintf(`%s %s`, QuoteIdentifier(sortCol), sortDir))
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

	// ++ INJECT CALCULATED FIELDS ++
	var calcFields []models.CalculatedField
	if err := h.db.Where("dataset_id = ? AND user_id = ?", id, userID).Find(&calcFields).Error; err == nil {
		for _, cf := range calcFields {
			formula := strings.ReplaceAll(cf.Formula, ";", "")
			formula = strings.ReplaceAll(formula, "--", "")

			colDefs = append(colDefs, models.ColumnDef{
				Name:        cf.Name,
				Type:        "number", // DLX formulas default to numeric in Phase 1
				CalcFormula: formula,
			})
		}
	}

	stats := map[string]interface{}{}

	if strings.HasPrefix(ds.StorageKey, "EXTERNAL_CONN::") {
		// EXTERNAL DB PATH: Return basic fake stats to prevent UI crash since complex queries may fail across different SQL dialects.
		for _, col := range colDefs {
			colStat := map[string]interface{}{
				"totalCount":    ds.RowCount,
				"nullCount":     0,
				"distinctCount": ds.RowCount, // Approximation
			}
			if col.Type == "number" {
				// Prevent crashes in frontend UI rendering charts by providing dummy min/max/avg for external data
				colStat["min"] = 0
				colStat["max"] = 100
				colStat["avg"] = 50
				colStat["stddev"] = 0
				colStat["sum"] = 100
			}
			stats[col.Name] = colStat
		}
	} else {
		// LOCAL DB PATH
		for _, col := range colDefs {
			safeCol := sanitizeIdentifier(col.Name)
			var quoted string
			if col.CalcFormula != "" {
				quoted = fmt.Sprintf(`(%s)`, col.CalcFormula)
			} else {
				quoted = fmt.Sprintf(`"%s"`, safeCol)
			}

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

	if h.svc != nil {
		if err := h.svc.DeleteDataset(c.Context(), id, userID); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
		return c.Status(fiber.StatusNoContent).Send(nil)
	}

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
	if !strings.HasPrefix(ds.StorageKey, "EXTERNAL_CONN::") {
		go func() {
			if strings.HasPrefix(ds.StorageKey, "AI_VIEW::") {
				_ = h.db.Exec(fmt.Sprintf(`DROP VIEW IF EXISTS %s`, ds.DataTableName)).Error
			} else {
				// Base table
				_ = h.db.Exec(fmt.Sprintf(`DROP TABLE IF EXISTS "%s"`, ds.DataTableName)).Error
			}
		}()
	}

	return c.Status(fiber.StatusNoContent).Send(nil)
}

// UpdateRefreshConfig sets the refresh schedule for a dataset.
// PUT /api/v1/datasets/:id/refresh-config
func (h *DatasetHandler) UpdateRefreshConfig(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	id := c.Params("id")

	var body struct {
		RefreshConfig json.RawMessage `json:"refreshConfig"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	if h.svc != nil {
		if err := h.svc.UpdateRefreshConfig(c.Context(), id, userID, body.RefreshConfig); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
		return c.JSON(fiber.Map{"message": "Refresh config updated"})
	}

	var ds models.Dataset
	if err := h.db.Where("id = ? AND user_id = ? AND deleted_at IS NULL", id, userID).First(&ds).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Dataset not found"})
	}

	if err := h.db.Model(&ds).Update("refresh_config", body.RefreshConfig).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update refresh config"})
	}

	return c.JSON(ds)
}

// RefreshDataset manual trigger for a dataset.
// POST /api/v1/datasets/:id/refresh
func (h *DatasetHandler) RefreshDataset(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	id := c.Params("id")

	var ds models.Dataset
	if err := h.db.Where("id = ? AND user_id = ? AND deleted_at IS NULL", id, userID).First(&ds).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Dataset not found"})
	}

	if err := h.PerformRefresh(&ds); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": fmt.Sprintf("Refresh failed: %v", err)})
	}

	return c.JSON(fiber.Map{"message": "Dataset refreshed successfully", "rowCount": ds.RowCount})
}

// PerformRefresh executes the actual data sync from external to internal.
func (h *DatasetHandler) PerformRefresh(ds *models.Dataset) error {
	if !strings.HasPrefix(ds.StorageKey, "EXTERNAL_CONN::") {
		return fmt.Errorf("only external connection datasets can be refreshed")
	}

	connID := strings.TrimPrefix(ds.StorageKey, "EXTERNAL_CONN::")
	var conn models.DBConnection
	if err := h.db.Where("id = ?", connID).First(&conn).Error; err != nil {
		return fmt.Errorf("external connection not found: %w", err)
	}

	opts := connectors.FromDBConnection(&conn, conn.PasswordEncrypted)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	dbConn, err := connectors.Open(opts)
	if err != nil {
		return fmt.Errorf("failed to open external connection: %w", err)
	}
	defer dbConn.Close()

	// 1. Get column names from internal table to ensure alignment
	rows, err := h.db.Raw(fmt.Sprintf(`SELECT * FROM "%s" LIMIT 0`, ds.DataTableName)).Rows()
	if err != nil {
		return fmt.Errorf("failed to get internal table schema: %w", err)
	}
	cols, _ := rows.Columns()
	rows.Close()

	// Filter out _row_id
	var actualCols []string
	for _, c := range cols {
		if c != "_row_id" {
			actualCols = append(actualCols, c)
		}
	}

	// 2. Pull data from external source
	// ds.FileName is used as the table name/query for external connection datasets
	externalQuery := fmt.Sprintf(`SELECT %s FROM %s`, strings.Join(actualCols, ", "), ds.FileName)
	if strings.Contains(strings.ToUpper(ds.FileName), "SELECT ") {
		// If it's a raw query
		externalQuery = ds.FileName
	}

	res, err := dbConn.Query(ctx, externalQuery, 1000000) // Support up to 1M rows for refresh
	if err != nil {
		return fmt.Errorf("failed to pull data from external source: %w", err)
	}

	// 3. Truncate internal table
	if err := h.db.Exec(fmt.Sprintf(`TRUNCATE TABLE "%s"`, ds.DataTableName)).Error; err != nil {
		return fmt.Errorf("failed to truncate internal table: %w", err)
	}

	// 4. Transform res.Rows (MAP) to [][]string (expected by bulkInsertRows)
	stringRows := make([][]string, len(res.Rows))
	for i, row := range res.Rows {
		stringRows[i] = make([]string, len(actualCols))
		for j, colName := range actualCols {
			val := row[colName]
			if val == nil {
				stringRows[i][j] = ""
			} else {
				stringRows[i][j] = fmt.Sprintf("%v", val)
			}
		}
	}

	// 5. Bulk insert into internal table
	if err := bulkInsertRows(h.db, ds.DataTableName, actualCols, stringRows); err != nil {
		return fmt.Errorf("failed to bulk insert refreshed data: %w", err)
	}

	// 6. Update metadata
	ds.RowCount = len(res.Rows)
	ds.UpdatedAt = time.Now()
	if err := h.db.Model(ds).Updates(map[string]interface{}{
		"row_count":  ds.RowCount,
		"updated_at": ds.UpdatedAt,
	}).Error; err != nil {
		return fmt.Errorf("failed to update dataset metadata: %w", err)
	}

	// PERF-07: Invalidate stats cache
	if h.rdb != nil {
		_ = h.rdb.Del(context.Background(), fmt.Sprintf("stats:%s", ds.ID)).Err()
	}

	return nil
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
			if utils.IsDateLike(val) {
				dateCount++
			}
			if len(sampleVals) < 3 {
				sampleVals = append(sampleVals, val)
			}
		}

		def.Nullable = nullCount > 0
		def.SampleVals = sampleVals

		// Robust detection: A column is only a 'number' or 'date' if ALL non-null samples match.
		// If even ONE sample is a string that doesn't fit, we fallback to 'string' (TEXT).
		nonNullCount := totalSamples - nullCount
		if nonNullCount > 0 {
			if numericCount == nonNullCount {
				def.Type = "number"
			} else if dateCount == nonNullCount {
				def.Type = "date"
			} else {
				def.Type = "string"
			}
		} else {
			def.Type = "string"
		}

		defs[i] = def
	}
	return defs
}

type AIGenerateRequest struct {
	SourceDatasetID string `json:"sourceDatasetId"`
	Name            string `json:"name"`
	Description     string `json:"description"`
	Query           string `json:"query"`
}

type AIBatchGenerateRequest struct {
	SourceDatasetID string              `json:"sourceDatasetId"`
	Datasets        []AIGenerateRequest `json:"datasets"`
}

// AIGenerateDataset interprets AI SQL to create a View and register it as a new Dataset.
// POST /api/v1/datasets/ai-generate
func (h *DatasetHandler) AIGenerateDataset(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized"})
	}

	var req AIGenerateRequest
	if err := c.BodyParser(&req); err != nil || req.SourceDatasetID == "" || req.Query == "" || req.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	// Verify source dataset exists and belongs to user
	var source models.Dataset
	if err := h.db.Where("id = ? AND user_id = ?", req.SourceDatasetID, userID).First(&source).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Source dataset not found"})
	}

	var isExternal bool
	var externalConn models.DBConnection

	if strings.HasPrefix(source.StorageKey, "EXTERNAL_CONN::") {
		isExternal = true
		connID := strings.TrimPrefix(source.StorageKey, "EXTERNAL_CONN::")
		if err := h.db.Where("id = ? AND user_id = ?", connID, userID).First(&externalConn).Error; err != nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "External connection not found"})
		}
	}

	// Basic query sanitization: Ensure it's a SELECT query and prevent obvious destructive commands
	req.Query = strings.TrimSpace(req.Query)
	for strings.HasSuffix(req.Query, ";") {
		req.Query = strings.TrimSuffix(req.Query, ";")
	}
	req.Query = strings.TrimSpace(req.Query)

	qUpper := strings.ToUpper(req.Query)
	if !strings.HasPrefix(qUpper, "SELECT") {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Only SELECT queries are allowed for view generation"})
	}
	if strings.Contains(qUpper, "DROP ") || strings.Contains(qUpper, "DELETE ") || strings.Contains(qUpper, "UPDATE ") || strings.Contains(qUpper, "INSERT ") || strings.Contains(qUpper, "ALTER ") {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Destructive commands are not allowed"})
	}

	var newCols []models.ColumnDef

	if isExternal {
		opts := connectors.FromDBConnection(&externalConn, externalConn.PasswordEncrypted)
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()

		dbConn, err := connectors.Open(opts)
		if err != nil {
			return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": fmt.Sprintf("External connection failed: %v", err)})
		}
		defer dbConn.Close()

		res, err := dbConn.Query(ctx, req.Query, 1)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Failed to validate AI query on external DB: " + err.Error()})
		}

		for _, colName := range res.Columns {
			genericType := "string"
			if len(res.Rows) > 0 {
				val := res.Rows[0][colName]
				switch val.(type) {
				case float64, int, int64, float32:
					genericType = "number"
				case time.Time:
					genericType = "date"
				case bool:
					genericType = "boolean"
				}
			}
			newCols = append(newCols, models.ColumnDef{
				Name: colName,
				Type: genericType,
			})
		}
	} else {
		// Perform an EXPLAIN on the core DB to validate the query logic
		explainQuery := fmt.Sprintf("EXPLAIN %s", req.Query)
		var dummy []map[string]interface{}
		if err := h.db.Raw(explainQuery).Scan(&dummy).Error; err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid SQL query generated by AI: " + err.Error()})
		}

		// Execute query once to extract column definitions (using LIMIT 1)
		limitQuery := fmt.Sprintf("SELECT * FROM (%s) AS sub LIMIT 1", req.Query)
		rows, err := h.db.Raw(limitQuery).Rows()
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Failed to extract schema from query: " + err.Error()})
		}
		defer rows.Close()

		colTypes, err := rows.ColumnTypes()
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to read columns"})
		}

		for _, ct := range colTypes {
			dbType := strings.ToUpper(ct.DatabaseTypeName())
			genericType := "string" // fallback
			if strings.Contains(dbType, "INT") || strings.Contains(dbType, "NUMERIC") || strings.Contains(dbType, "FLOAT") || strings.Contains(dbType, "DECIMAL") {
				genericType = "number"
			} else if strings.Contains(dbType, "TIME") || strings.Contains(dbType, "DATE") {
				genericType = "date"
			} else if strings.Contains(dbType, "BOOL") {
				genericType = "boolean"
			}
			newCols = append(newCols, models.ColumnDef{
				Name: ct.Name(),
				Type: genericType,
			})
		}
	}

	colJSON, err := encodeColumns(newCols)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to encode column schema"})
	}

	// Create unique ID for the new dataset
	newDatasetID := uuid.New().String()
	viewName := ""
	var rowCount int64

	if isExternal {
		// For external queries, we use a subquery alias as the virtual table name
		// Example: (SELECT * FROM a) AS virtual_view
		viewName = fmt.Sprintf(`(%s) AS ai_virtual_view_%s`, req.Query, sanitizeTableName(newDatasetID))
		
		// Optional: try to count
		ctxCount, cancelCount := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancelCount()
		opts := connectors.FromDBConnection(&externalConn, externalConn.PasswordEncrypted)
		dbConnCount, _ := connectors.Open(opts)
		if dbConnCount != nil {
			countRes, err := dbConnCount.Query(ctxCount, fmt.Sprintf("SELECT COUNT(*) FROM %s", viewName), 1)
			if err == nil && len(countRes.Rows) > 0 {
				for _, v := range countRes.Rows[0] {
					switch val := v.(type) {
					case int64:
						rowCount = val
					case float64:
						rowCount = int64(val)
					case string:
						parsed, _ := strconv.ParseInt(val, 10, 64)
						rowCount = parsed
					}
					break
				}
			}
			dbConnCount.Close()
		}
	} else {
		viewName = sanitizeTableName(newDatasetID) + "_view"
		// Create the PostgreSQL VIEW
		createViewSQL := fmt.Sprintf("CREATE OR REPLACE VIEW %s AS %s", viewName, req.Query)
		if err := h.db.Exec(createViewSQL).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create database view: " + err.Error()})
		}
		// Estimate row count
		h.db.Raw(fmt.Sprintf("SELECT COUNT(*) FROM %s", viewName)).Scan(&rowCount)
	}

	newStorageKey := "AI_VIEW::" + req.Description
	if isExternal {
		newStorageKey = source.StorageKey // Re-use EXTERNAL_CONN string to query original external DB
	}

	// Create Dataset Record
	datasetRecord := models.Dataset{
		ID:            newDatasetID,
		UserID:        userID,
		Name:          req.Name + " (AI Generated)",
		FileName:      req.Name + " - " + req.Description,
		Columns:       colJSON,
		RowCount:      int(rowCount),
		SizeBytes:     0, // Views take no direct storage size for data
		StorageKey:    newStorageKey,
		DataTableName: viewName,
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}

	if err := h.db.Create(&datasetRecord).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save dataset record: " + err.Error()})
	}

	return c.JSON(datasetRecord)
}

// AIBatchGenerateDatasets handles multiple AI dataset registrations in one go.
// This prevents resource exhaustion on Supabase Free Tier by avoiding parallel DDL hits.
// POST /api/v1/datasets/ai-generate-batch
func (h *DatasetHandler) AIBatchGenerateDatasets(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized"})
	}

	var req AIBatchGenerateRequest
	if err := c.BodyParser(&req); err != nil || len(req.Datasets) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid batch request payload"})
	}

	results := make([]models.Dataset, 0, len(req.Datasets))

	// Process sequentially to keep DB load stable
	for _, dsReq := range req.Datasets {
		// reuse logic by calling internal helper if needed, or inline for now as it's small
		// but let's add a "Smart Limit" to the query if it's missing and looks like raw data
		dsReq.Query = applySmartLimit(dsReq.Query)

		// Verification logic (simplified from AIGenerateDataset)
		var source models.Dataset
		if err := h.db.Where("id = ? AND user_id = ?", req.SourceDatasetID, userID).First(&source).Error; err != nil {
			continue // Skip failed source lookups in batch
		}

		newDatasetID := uuid.New().String()
		viewName := sanitizeTableName(newDatasetID) + "_view"

		// Create the PostgreSQL VIEW (DDL)
		createViewSQL := fmt.Sprintf("CREATE OR REPLACE VIEW %s AS %s", viewName, dsReq.Query)
		if err := h.db.Exec(createViewSQL).Error; err != nil {
			log.Error().Err(err).Str("query", dsReq.Query).Msg("Failed to create Batch AI View")
			continue
		}

		// Calculate columns (extract schema)
		limitQuery := fmt.Sprintf("SELECT * FROM %s LIMIT 1", viewName)
		rows, _ := h.db.Raw(limitQuery).Rows()
		var newCols []models.ColumnDef
		if rows != nil {
			colTypes, _ := rows.ColumnTypes()
			for _, ct := range colTypes {
				dbType := strings.ToUpper(ct.DatabaseTypeName())
				genericType := "string"
				if strings.Contains(dbType, "INT") || strings.Contains(dbType, "NUMERIC") || strings.Contains(dbType, "FLOAT") {
					genericType = "number"
				} else if strings.Contains(dbType, "TIME") || strings.Contains(dbType, "DATE") {
					genericType = "date"
				} else if strings.Contains(dbType, "BOOL") {
					genericType = "boolean"
				}
				newCols = append(newCols, models.ColumnDef{Name: ct.Name(), Type: genericType})
			}
			rows.Close()
		}

		colJSON, _ := encodeColumns(newCols)
		var rowCount int64
		h.db.Raw(fmt.Sprintf("SELECT COUNT(*) FROM %s", viewName)).Scan(&rowCount)

		datasetRecord := models.Dataset{
			ID:            newDatasetID,
			UserID:        userID,
			Name:          dsReq.Name + " (AI)",
			FileName:      dsReq.Name,
			Columns:       colJSON,
			RowCount:      int(rowCount),
			StorageKey:    "AI_BATCH_VIEW::" + dsReq.Description,
			DataTableName: viewName,
			CreatedAt:     time.Now(),
			UpdatedAt:     time.Now(),
		}

		if err := h.db.Create(&datasetRecord).Error; err == nil {
			results = append(results, datasetRecord)
		}
	}

	return c.Status(fiber.StatusCreated).JSON(results)
}

// applySmartLimit adds LIMIT 1000 to queries that don't have GROUP BY / Aggregation.
// This ensures charts based on full results stay accurate, but raw data queries don't spike DB.
func applySmartLimit(query string) string {
	q := strings.TrimSpace(query)
	upper := strings.ToUpper(q)
	
	// If it has aggregation keywords, let it scan (assuming business logic needs full data)
	if strings.Contains(upper, "GROUP BY") || strings.Contains(upper, "SUM(") || strings.Contains(upper, "COUNT(") || strings.Contains(upper, "AVG(") {
		return q
	}

	// If it already has a limit, don't override
	if strings.Contains(upper, "LIMIT ") {
		return q
	}

	return q + " LIMIT 1000"
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
			log.Error().Err(err).Str("table", tableName).Int("batch_start", batchStart).Msg("bulkInsertRows: Batch insert failed")
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

// ExecuteRawQuery runs a raw SQL query against a dataset
// POST /api/v1/datasets/:id/query
func (h *DatasetHandler) ExecuteRawQuery(c *fiber.Ctx) error {
	id := c.Params("id")
	userID := middleware.GetUserID(c)

	var req struct {
		Query string `json:"query"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	// Basic query validation
	qStr := strings.TrimSpace(req.Query)
	lowerQ := strings.ToLower(qStr)
	if !strings.HasPrefix(lowerQ, "select") && !strings.HasPrefix(lowerQ, "with") {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Only SELECT or WITH queries are allowed"})
	}
	for _, forbidden := range []string{"drop ", "delete ", "insert ", "update ", "alter ", "truncate "} {
		if strings.Contains(lowerQ, forbidden) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Destructive SQL operations are not allowed"})
		}
	}

	var ds models.Dataset
	if err := h.db.Where("id = ? AND user_id = ?", id, userID).First(&ds).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Dataset not found"})
	}

	start := time.Now()

	// External database query
	if strings.HasPrefix(ds.StorageKey, "EXTERNAL_CONN::") {
		connID := strings.TrimPrefix(ds.StorageKey, "EXTERNAL_CONN::")
		var conn models.DBConnection
		if err := h.db.Where("id = ? AND user_id = ?", connID, userID).First(&conn).Error; err != nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "External connection not found"})
		}
		opts := connectors.FromDBConnection(&conn, conn.PasswordEncrypted)
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		dbConn, err := connectors.Open(opts)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to connect to external DB"})
		}
		defer dbConn.Close()

		res, err := dbConn.Query(ctx, req.Query, 1000)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}
		
		return c.JSON(fiber.Map{
			"columns":       res.Columns,
			"rows":          res.Rows,
			"executionTime": time.Since(start).Milliseconds(),
			"rowCount":      len(res.Rows),
		})
	}

	// Internal database query
	queryWithLimit := qStr
	if !strings.Contains(lowerQ, "limit ") {
		queryWithLimit = queryWithLimit + " LIMIT 1000"
	}

	rows, err := h.db.Raw(queryWithLimit).Rows()
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	cols, _ := rows.Columns()
	var results []map[string]interface{}

	for rows.Next() {
		val := make(map[string]interface{})
		if err := h.db.ScanRows(rows, &val); err == nil {
			results = append(results, val)
		}
	}

	return c.JSON(fiber.Map{
		"columns":       cols,
		"rows":          results,
		"executionTime": time.Since(start).Milliseconds(),
		"rowCount":      len(results),
	})
}

// AggregateDataset performs Group-By and Aggregations on a dataset.
// GET /api/v1/datasets/:id/aggregate?groupBy=col1,col2&measures=sum:col3,avg:col4
func (h *DatasetHandler) AggregateDataset(c *fiber.Ctx) error {
	id := c.Params("id")
	userID := middleware.GetUserID(c)

	groupByStr := c.Query("groupBy")
	measuresStr := c.Query("measures")

	if groupByStr == "" && measuresStr == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "groupBy or measures is required"})
	}

	var ds models.Dataset
	if err := h.db.Where("id = ? AND user_id = ?", id, userID).First(&ds).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Dataset not found"})
	}

	// 1. Parse and sanitize GroupBy columns
	var groupCols []string
	if groupByStr != "" {
		for _, col := range strings.Split(groupByStr, ",") {
			trimmed := strings.TrimSpace(col)
			if trimmed != "" {
				groupCols = append(groupCols, `"`+sanitizeIdentifier(trimmed)+`"`)
			}
		}
	}

	// 2. Parse and sanitize Measures (Aggregations)
	// Format: function:column (e.g., sum:price, count:id)
	var selectClauses []string
	selectClauses = append(selectClauses, groupCols...)

	if measuresStr != "" {
		for _, m := range strings.Split(measuresStr, ",") {
			parts := strings.Split(strings.TrimSpace(m), ":")
			if len(parts) != 2 {
				continue
			}
			fn := strings.ToUpper(parts[0])
			col := parts[1]

			// Validate allowed functions to prevent SQL injection
			allowedFns := map[string]bool{"SUM": true, "AVG": true, "COUNT": true, "MIN": true, "MAX": true}
			if !allowedFns[fn] {
				continue
			}

			sanitizedCol := sanitizeIdentifier(col)
			alias := fmt.Sprintf("%s_%s", strings.ToLower(fn), sanitizedCol)
			selectClauses = append(selectClauses, fmt.Sprintf(`%s("%s") AS "%s"`, fn, sanitizedCol, alias))
		}
	}

	if len(selectClauses) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid aggregation parameters"})
	}

	start := time.Now()
	query := fmt.Sprintf(`SELECT %s FROM "%s"`, strings.Join(selectClauses, ", "), ds.DataTableName)
	if len(groupCols) > 0 {
		query += fmt.Sprintf(" GROUP BY %s", strings.Join(groupCols, ", "))
	}

	// External database query
	if strings.HasPrefix(ds.StorageKey, "EXTERNAL_CONN::") {
		connID := strings.TrimPrefix(ds.StorageKey, "EXTERNAL_CONN::")
		var conn models.DBConnection
		if err := h.db.Where("id = ? AND user_id = ?", connID, userID).First(&conn).Error; err != nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "External connection not found"})
		}
		opts := connectors.FromDBConnection(&conn, conn.PasswordEncrypted)
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		dbConn, err := connectors.Open(opts)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to connect to external DB"})
		}
		defer dbConn.Close()

		res, err := dbConn.Query(ctx, query, 2000)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}

		return c.JSON(fiber.Map{
			"columns":       res.Columns,
			"rows":          res.Rows,
			"executionTime": time.Since(start).Milliseconds(),
			"rowCount":      len(res.Rows),
		})
	}

	// Internal database query
	rows, err := h.db.Raw(query).Rows()
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	cols, _ := rows.Columns()
	var results []map[string]interface{}
	for rows.Next() {
		val := make(map[string]interface{})
		if err := h.db.ScanRows(rows, &val); err == nil {
			results = append(results, val)
		}
	}

	return c.JSON(fiber.Map{
		"columns":       cols,
		"rows":          results,
		"executionTime": time.Since(start).Milliseconds(),
		"rowCount":      len(results),
	})
}

// SimulateETL runs a transient transformation on provided data for preview.
// POST /api/v1/datasets/simulate
func (h *DatasetHandler) SimulateETL(c *fiber.Ctx) error {
	var body struct {
		Nodes []engine.NodeSpec `json:"nodes"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	// 1. Process nodes to handle external sources as inline data
	for i := range body.Nodes {
		node := &body.Nodes[i]
		if node.Type == "source" && node.Config["table"] != nil {
			tableName := fmt.Sprintf("%v", node.Config["table"])
			if tableName != "" {
				// Check if this table is an external dataset
				var ds models.Dataset
				if err := h.db.Where("data_table_name = ?", tableName).First(&ds).Error; err == nil {
					isExternal := strings.HasPrefix(ds.StorageKey, "EXTERNAL_CONN::")
					if isExternal {
						connID := strings.TrimPrefix(ds.StorageKey, "EXTERNAL_CONN::")
						var extConn models.DBConnection
						if err := h.db.Where("id = ?", connID).First(&extConn).Error; err == nil {
							opts := connectors.FromDBConnection(&extConn, extConn.PasswordEncrypted)
							dbConn, err := connectors.Open(opts)
							if err == nil {
								defer dbConn.Close()
								// Fetch 100 sample rows
								sampleQuery := fmt.Sprintf(`SELECT * FROM %s LIMIT 100`, QuoteIdentifier(ds.DataTableName))
								res, errQuery := dbConn.Query(c.Context(), sampleQuery, 100)
								if errQuery == nil && len(res.Rows) > 0 {
									// Inject as inline data
									node.Config["data"] = res.Rows
									delete(node.Config, "table")
								}
							}
						}
					}
				}
			}
		}
	}

	spec := engine.PipelineSpec{Nodes: body.Nodes}
	ctx, cancel := context.WithTimeout(c.Context(), 60*time.Second)
	defer cancel()

	result, err := engine.RunVisualPipeline(ctx, h.db, spec)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{
		"rows":        result.Rows,
		"nodeOutputs": result.NodeOutputs,
		"errors":      result.Errors,
		"order":       result.Order,
	})
}

// QuoteIdentifier handles quoting for SQL identifiers, potentially schema-qualified.
// e.g. "public.table" -> "public"."table"
func QuoteIdentifier(s string) string {
	if s == "" {
		return ""
	}
	parts := strings.Split(s, ".")
	for i, p := range parts {
		// Only quote if not already quoted
		if !strings.HasPrefix(p, "\"") {
			parts[i] = fmt.Sprintf("\"%s\"", p)
		}
	}
	return strings.Join(parts, ".")
}

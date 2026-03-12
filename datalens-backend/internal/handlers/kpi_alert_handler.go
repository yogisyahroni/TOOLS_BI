package handlers

import (
	"time"

	"datalens/internal/middleware"
	"datalens/internal/models"
	"datalens/internal/services"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// KPIHandler handles KPI scorecard operations.
type KPIHandler struct{ db *gorm.DB }

func NewKPIHandler(db *gorm.DB) *KPIHandler { return &KPIHandler{db: db} }

// ListKPIs returns all KPIs for the user.
func (h *KPIHandler) ListKPIs(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var kpis []models.KPI
	if err := h.db.Where("user_id = ?", userID).Find(&kpis).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch KPIs"})
	}
	return c.JSON(fiber.Map{"data": kpis})
}

// CreateKPI creates a new KPI.
func (h *KPIHandler) CreateKPI(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var req struct {
		DatasetID   string   `json:"datasetId"`
		Name        string   `json:"name"`
		ColumnName  string   `json:"columnName"`
		Aggregation string   `json:"aggregation"`
		Target      *float64 `json:"target"`
		Unit        string   `json:"unit"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
	}
	if req.Name == "" || req.ColumnName == "" || req.DatasetID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name, columnName, datasetId required"})
	}

	kpi := models.KPI{
		ID:          uuid.New().String(),
		UserID:      userID,
		DatasetID:   req.DatasetID,
		Name:        req.Name,
		ColumnName:  req.ColumnName,
		Aggregation: req.Aggregation,
		Target:      req.Target,
		Unit:        req.Unit,
		CreatedAt:   time.Now(),
	}
	if err := h.db.Create(&kpi).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create KPI"})
	}
	return c.Status(fiber.StatusCreated).JSON(kpi)
}

// UpdateKPI updates a KPI — uses explicit DTO to prevent mass assignment.
func (h *KPIHandler) UpdateKPI(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var kpi models.KPI
	if err := h.db.Where("id = ? AND user_id = ?", c.Params("id"), userID).First(&kpi).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "KPI not found"})
	}

	var req struct {
		Name        *string  `json:"name"`
		ColumnName  *string  `json:"columnName"`
		Aggregation *string  `json:"aggregation"`
		Target      *float64 `json:"target"`
		Unit        *string  `json:"unit"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
	}

	updates := map[string]interface{}{}
	if req.Name != nil {
		updates["name"] = *req.Name
	}
	if req.ColumnName != nil {
		updates["column_name"] = *req.ColumnName
	}
	if req.Aggregation != nil {
		updates["aggregation"] = *req.Aggregation
	}
	if req.Target != nil {
		updates["target"] = *req.Target
	}
	if req.Unit != nil {
		updates["unit"] = *req.Unit
	}

	if err := h.db.Model(&kpi).Updates(updates).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Update failed"})
	}
	return c.JSON(kpi)
}

// DeleteKPI deletes a KPI.
func (h *KPIHandler) DeleteKPI(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if err := h.db.Where("id = ? AND user_id = ?", c.Params("id"), userID).Delete(&models.KPI{}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Delete failed"})
	}
	return c.Status(fiber.StatusNoContent).Send(nil)
}

// AlertHandler handles data alert operations.
type AlertHandler struct {
	db  *gorm.DB
	hub interface{ SendToUser(string, interface{}) } // avoid circular import
	svc *services.DataAlertService                   // Phase 31: service layer
}

type AlertHub interface {
	SendToUser(userID string, event interface{})
}

// NewAlertHandler creates a new AlertHandler.
func NewAlertHandler(db *gorm.DB) *AlertHandler { return &AlertHandler{db: db} }

// SetService injects the DataAlertService after construction.
func (h *AlertHandler) SetService(svc *services.DataAlertService) { h.svc = svc }

// ListAlerts returns all alerts for the user.
func (h *AlertHandler) ListAlerts(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var alerts []models.DataAlert
	if err := h.db.Where("user_id = ?", userID).Find(&alerts).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Fetch failed"})
	}
	return c.JSON(fiber.Map{"data": alerts})
}

// CreateAlert creates a new data alert.
func (h *AlertHandler) CreateAlert(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var req struct {
		DatasetID  string  `json:"datasetId"`
		Name       string  `json:"name"`
		ColumnName string  `json:"columnName"`
		Condition  string  `json:"condition"`
		Threshold  float64 `json:"threshold"`
		NotifyVia  string  `json:"notifyVia"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
	}
	if req.Name == "" || req.ColumnName == "" || req.Condition == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name, columnName, condition required"})
	}

	alert := models.DataAlert{
		ID:         uuid.New().String(),
		UserID:     userID,
		DatasetID:  req.DatasetID,
		Name:       req.Name,
		ColumnName: req.ColumnName,
		Condition:  req.Condition,
		Threshold:  req.Threshold,
		NotifyVia:  req.NotifyVia,
		Enabled:    true,
		CreatedAt:  time.Now(),
	}
	if err := h.db.Create(&alert).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Create failed"})
	}
	return c.Status(fiber.StatusCreated).JSON(alert)
}

// UpdateAlert updates alert configuration with whitelisted fields.
// BUG-04 fix: properly handles BodyParser errors and DB update errors.
func (h *AlertHandler) UpdateAlert(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var alert models.DataAlert
	if err := h.db.Where("id = ? AND user_id = ?", c.Params("id"), userID).First(&alert).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Alert not found"})
	}

	// BUG-04 fix: check BodyParser error (was silently ignored with _=)
	var req struct {
		Name       *string  `json:"name"`
		ColumnName *string  `json:"columnName"`
		Condition  *string  `json:"condition"`
		Threshold  *float64 `json:"threshold"`
		NotifyVia  *string  `json:"notifyVia"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
	}

	updates := map[string]interface{}{}
	if req.Name != nil {
		updates["name"] = *req.Name
	}
	if req.ColumnName != nil {
		updates["column_name"] = *req.ColumnName
	}
	if req.Condition != nil {
		updates["condition"] = *req.Condition
	}
	if req.Threshold != nil {
		updates["threshold"] = *req.Threshold
	}
	if req.NotifyVia != nil {
		updates["notify_via"] = *req.NotifyVia
	}

	// BUG-04 fix: check DB error (was silently ignored before)
	if err := h.db.Model(&alert).Updates(updates).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Update failed"})
	}
	return c.JSON(alert)
}

// DeleteAlert deletes an alert.
// BUG-04 fix: error is now checked and returned to client.
func (h *AlertHandler) DeleteAlert(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	// BUG-04 fix: check Delete error (was silently ignored before)
	if err := h.db.Where("id = ? AND user_id = ?", c.Params("id"), userID).Delete(&models.DataAlert{}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Delete failed"})
	}
	return c.Status(fiber.StatusNoContent).Send(nil)
}

// ToggleAlert enables or disables an alert.
// BUG-04 fix: DB update error is now checked.
func (h *AlertHandler) ToggleAlert(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var alert models.DataAlert
	if err := h.db.Where("id = ? AND user_id = ?", c.Params("id"), userID).First(&alert).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Alert not found"})
	}
	newEnabled := !alert.Enabled
	if err := h.db.Model(&alert).Update("enabled", newEnabled).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Toggle failed"})
	}
	return c.JSON(fiber.Map{"enabled": newEnabled})
}

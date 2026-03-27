package repository

import (
	"context"
	"fmt"

	"neuradash/internal/models"

	"gorm.io/gorm"
)

// ---- Dashboard ---------------------------------------------------------------

type dashboardRepo struct{ db *gorm.DB }

func NewDashboardRepository(db *gorm.DB) DashboardRepository {
	return &dashboardRepo{db: db}
}

func (r *dashboardRepo) List(ctx context.Context, userID string, page, limit int) ([]models.Dashboard, int64, error) {
	if limit > 100 {
		limit = 100
	}
	offset := (page - 1) * limit
	var list []models.Dashboard
	var total int64
	q := r.db.WithContext(ctx).Where("user_id = ? AND deleted_at IS NULL", userID)
	if err := q.Model(&models.Dashboard{}).Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("count dashboards: %w", err)
	}
	if err := q.Offset(offset).Limit(limit).Order("created_at desc").Find(&list).Error; err != nil {
		return nil, 0, fmt.Errorf("list dashboards: %w", err)
	}
	return list, total, nil
}

func (r *dashboardRepo) GetByID(ctx context.Context, id, userID string) (*models.Dashboard, error) {
	var d models.Dashboard
	err := r.db.WithContext(ctx).
		Where("id = ? AND user_id = ? AND deleted_at IS NULL", id, userID).
		First(&d).Error
	if err != nil {
		return nil, fmt.Errorf("get dashboard %s: %w", id, err)
	}
	return &d, nil
}

func (r *dashboardRepo) Create(ctx context.Context, d *models.Dashboard) error {
	if err := r.db.WithContext(ctx).Create(d).Error; err != nil {
		return fmt.Errorf("create dashboard: %w", err)
	}
	return nil
}

func (r *dashboardRepo) Update(ctx context.Context, d *models.Dashboard) error {
	if err := r.db.WithContext(ctx).Save(d).Error; err != nil {
		return fmt.Errorf("update dashboard %s: %w", d.ID, err)
	}
	return nil
}

func (r *dashboardRepo) Delete(ctx context.Context, id, userID string) error {
	res := r.db.WithContext(ctx).
		Where("id = ? AND user_id = ?", id, userID).
		Delete(&models.Dashboard{})
	if res.Error != nil {
		return fmt.Errorf("delete dashboard %s: %w", id, res.Error)
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// ---- Chart ------------------------------------------------------------------

type chartRepo struct{ db *gorm.DB }

func NewChartRepository(db *gorm.DB) ChartRepository {
	return &chartRepo{db: db}
}

func (r *chartRepo) List(ctx context.Context, userID string, page, limit int) ([]models.SavedChart, int64, error) {
	if limit > 100 {
		limit = 100
	}
	offset := (page - 1) * limit
	var list []models.SavedChart
	var total int64
	q := r.db.WithContext(ctx).Where("user_id = ?", userID)
	if err := q.Model(&models.SavedChart{}).Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("count charts: %w", err)
	}
	if err := q.Offset(offset).Limit(limit).Order("created_at desc").Find(&list).Error; err != nil {
		return nil, 0, fmt.Errorf("list charts: %w", err)
	}
	return list, total, nil
}

func (r *chartRepo) GetByID(ctx context.Context, id, userID string) (*models.SavedChart, error) {
	var c models.SavedChart
	err := r.db.WithContext(ctx).Where("id = ? AND user_id = ?", id, userID).First(&c).Error
	if err != nil {
		return nil, fmt.Errorf("get chart %s: %w", id, err)
	}
	return &c, nil
}

func (r *chartRepo) Create(ctx context.Context, c *models.SavedChart) error {
	if err := r.db.WithContext(ctx).Create(c).Error; err != nil {
		return fmt.Errorf("create chart: %w", err)
	}
	return nil
}

func (r *chartRepo) Update(ctx context.Context, c *models.SavedChart) error {
	if err := r.db.WithContext(ctx).Save(c).Error; err != nil {
		return fmt.Errorf("update chart %s: %w", c.ID, err)
	}
	return nil
}

func (r *chartRepo) Delete(ctx context.Context, id, userID string) error {
	res := r.db.WithContext(ctx).Where("id = ? AND user_id = ?", id, userID).Delete(&models.SavedChart{})
	if res.Error != nil {
		return fmt.Errorf("delete chart %s: %w", id, res.Error)
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// ---- User -------------------------------------------------------------------

type userRepo struct{ db *gorm.DB }

func NewUserRepository(db *gorm.DB) UserRepository {
	return &userRepo{db: db}
}

func (r *userRepo) GetByEmail(ctx context.Context, email string) (*models.User, error) {
	var u models.User
	err := r.db.WithContext(ctx).Where("email = ?", email).First(&u).Error
	if err != nil {
		return nil, fmt.Errorf("get user by email: %w", err)
	}
	return &u, nil
}

func (r *userRepo) GetByID(ctx context.Context, id string) (*models.User, error) {
	var u models.User
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&u).Error; err != nil {
		return nil, fmt.Errorf("get user %s: %w", id, err)
	}
	return &u, nil
}

func (r *userRepo) Create(ctx context.Context, u *models.User) error {
	if err := r.db.WithContext(ctx).Create(u).Error; err != nil {
		return fmt.Errorf("create user: %w", err)
	}
	return nil
}

func (r *userRepo) Update(ctx context.Context, u *models.User) error {
	if err := r.db.WithContext(ctx).Save(u).Error; err != nil {
		return fmt.Errorf("update user %s: %w", u.ID, err)
	}
	return nil
}

func (r *userRepo) ExistsByEmail(ctx context.Context, email string) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&models.User{}).Where("email = ?", email).Count(&count).Error
	return count > 0, err
}

// ---- Connection -------------------------------------------------------------

type connectionRepo struct{ db *gorm.DB }

func NewConnectionRepository(db *gorm.DB) ConnectionRepository {
	return &connectionRepo{db: db}
}

func (r *connectionRepo) List(ctx context.Context, userID string) ([]models.DBConnection, error) {
	var list []models.DBConnection
	err := r.db.WithContext(ctx).Where("user_id = ?", userID).Order("created_at desc").Find(&list).Error
	if err != nil {
		return nil, fmt.Errorf("list connections: %w", err)
	}
	return list, nil
}

func (r *connectionRepo) GetByID(ctx context.Context, id, userID string) (*models.DBConnection, error) {
	var c models.DBConnection
	err := r.db.WithContext(ctx).Where("id = ? AND user_id = ?", id, userID).First(&c).Error
	if err != nil {
		return nil, fmt.Errorf("get connection %s: %w", id, err)
	}
	return &c, nil
}

func (r *connectionRepo) Create(ctx context.Context, c *models.DBConnection) error {
	if err := r.db.WithContext(ctx).Create(c).Error; err != nil {
		return fmt.Errorf("create connection: %w", err)
	}
	return nil
}

func (r *connectionRepo) Update(ctx context.Context, c *models.DBConnection) error {
	if err := r.db.WithContext(ctx).Save(c).Error; err != nil {
		return fmt.Errorf("update connection %s: %w", c.ID, err)
	}
	return nil
}

func (r *connectionRepo) Delete(ctx context.Context, id, userID string) error {
	res := r.db.WithContext(ctx).Where("id = ? AND user_id = ?", id, userID).Delete(&models.DBConnection{})
	if res.Error != nil {
		return fmt.Errorf("delete connection %s: %w", id, res.Error)
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// ---- DataAlert (KPI Alert) --------------------------------------------------

type dataAlertRepo struct{ db *gorm.DB }

// NewDataAlertRepository constructs a DataAlertRepository backed by GORM.
func NewDataAlertRepository(db *gorm.DB) DataAlertRepository {
	return &dataAlertRepo{db: db}
}

func (r *dataAlertRepo) List(ctx context.Context, userID string) ([]models.DataAlert, error) {
	var list []models.DataAlert
	err := r.db.WithContext(ctx).Where("user_id = ?", userID).Order("created_at desc").Find(&list).Error
	if err != nil {
		return nil, fmt.Errorf("list data alerts: %w", err)
	}
	return list, nil
}

func (r *dataAlertRepo) GetByID(ctx context.Context, id, userID string) (*models.DataAlert, error) {
	var a models.DataAlert
	err := r.db.WithContext(ctx).Where("id = ? AND user_id = ?", id, userID).First(&a).Error
	if err != nil {
		return nil, fmt.Errorf("get data alert %s: %w", id, err)
	}
	return &a, nil
}

func (r *dataAlertRepo) Create(ctx context.Context, a *models.DataAlert) error {
	if err := r.db.WithContext(ctx).Create(a).Error; err != nil {
		return fmt.Errorf("create data alert: %w", err)
	}
	return nil
}

func (r *dataAlertRepo) Update(ctx context.Context, a *models.DataAlert) error {
	if err := r.db.WithContext(ctx).Save(a).Error; err != nil {
		return fmt.Errorf("update data alert %s: %w", a.ID, err)
	}
	return nil
}

func (r *dataAlertRepo) Delete(ctx context.Context, id, userID string) error {
	res := r.db.WithContext(ctx).Where("id = ? AND user_id = ?", id, userID).Delete(&models.DataAlert{})
	if res.Error != nil {
		return fmt.Errorf("delete data alert %s: %w", id, res.Error)
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (r *dataAlertRepo) ToggleEnabled(ctx context.Context, id, userID string, enabled bool) error {
	res := r.db.WithContext(ctx).
		Model(&models.DataAlert{}).
		Where("id = ? AND user_id = ?", id, userID).
		Update("enabled", enabled)
	if res.Error != nil {
		return fmt.Errorf("toggle data alert %s: %w", id, res.Error)
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

package repository

import (
	"context"
	"fmt"

	"datalens/internal/models"

	"gorm.io/gorm"
)

// datasetRepo is the GORM implementation of DatasetRepository.
type datasetRepo struct {
	db *gorm.DB
}

// NewDatasetRepository constructs a datasetRepo.
func NewDatasetRepository(db *gorm.DB) DatasetRepository {
	return &datasetRepo{db: db}
}

func (r *datasetRepo) List(ctx context.Context, userID string, page, limit int) ([]models.Dataset, int64, error) {
	if limit > 100 {
		limit = 100
	}
	offset := (page - 1) * limit

	var datasets []models.Dataset
	var total int64

	q := r.db.WithContext(ctx).Where("user_id = ? AND deleted_at IS NULL", userID)
	if err := q.Model(&models.Dataset{}).Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("count datasets: %w", err)
	}
	if err := q.Offset(offset).Limit(limit).Order("created_at desc").Find(&datasets).Error; err != nil {
		return nil, 0, fmt.Errorf("list datasets: %w", err)
	}
	return datasets, total, nil
}

func (r *datasetRepo) GetByID(ctx context.Context, id, userID string) (*models.Dataset, error) {
	var d models.Dataset
	err := r.db.WithContext(ctx).
		Where("id = ? AND user_id = ? AND deleted_at IS NULL", id, userID).
		First(&d).Error
	if err != nil {
		return nil, fmt.Errorf("get dataset %s: %w", id, err)
	}
	return &d, nil
}

func (r *datasetRepo) Create(ctx context.Context, d *models.Dataset) error {
	if err := r.db.WithContext(ctx).Create(d).Error; err != nil {
		return fmt.Errorf("create dataset: %w", err)
	}
	return nil
}

func (r *datasetRepo) Update(ctx context.Context, d *models.Dataset) error {
	if err := r.db.WithContext(ctx).Save(d).Error; err != nil {
		return fmt.Errorf("update dataset %s: %w", d.ID, err)
	}
	return nil
}

func (r *datasetRepo) SoftDelete(ctx context.Context, id, userID string) error {
	res := r.db.WithContext(ctx).
		Model(&models.Dataset{}).
		Where("id = ? AND user_id = ?", id, userID).
		Update("deleted_at", gorm.Expr("NOW()"))
	if res.Error != nil {
		return fmt.Errorf("soft-delete dataset %s: %w", id, res.Error)
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (r *datasetRepo) CountByUser(ctx context.Context, userID string) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&models.Dataset{}).
		Where("user_id = ? AND deleted_at IS NULL", userID).
		Count(&count).Error
	return count, err
}

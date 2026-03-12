// Package repository defines the data-access contracts (Repository Pattern).
// Handlers MUST NOT touch gorm.DB directly — they call Service → Repository.
package repository

import (
	"context"

	"datalens/internal/models"
)

// ---- Dataset ----------------------------------------------------------------

// DatasetRepository is the contract for Dataset persistence.
type DatasetRepository interface {
	// List returns paginated datasets for a user.
	List(ctx context.Context, userID string, page, limit int) ([]models.Dataset, int64, error)
	// GetByID returns a single dataset owned by userID.
	GetByID(ctx context.Context, id, userID string) (*models.Dataset, error)
	// Create persists a new dataset.
	Create(ctx context.Context, d *models.Dataset) error
	// Update persists changes to an existing dataset.
	Update(ctx context.Context, d *models.Dataset) error
	// SoftDelete marks a dataset as deleted without removing the row.
	SoftDelete(ctx context.Context, id, userID string) error
	// CountByUser returns total number of datasets belonging to a user.
	CountByUser(ctx context.Context, userID string) (int64, error)
}

// ---- Dashboard --------------------------------------------------------------

// DashboardRepository is the contract for Dashboard persistence.
type DashboardRepository interface {
	List(ctx context.Context, userID string, page, limit int) ([]models.Dashboard, int64, error)
	GetByID(ctx context.Context, id, userID string) (*models.Dashboard, error)
	Create(ctx context.Context, d *models.Dashboard) error
	Update(ctx context.Context, d *models.Dashboard) error
	Delete(ctx context.Context, id, userID string) error
}

// ---- Chart ------------------------------------------------------------------

// ChartRepository is the contract for SavedChart persistence.
type ChartRepository interface {
	List(ctx context.Context, userID string, page, limit int) ([]models.SavedChart, int64, error)
	GetByID(ctx context.Context, id, userID string) (*models.SavedChart, error)
	Create(ctx context.Context, c *models.SavedChart) error
	Update(ctx context.Context, c *models.SavedChart) error
	Delete(ctx context.Context, id, userID string) error
}

// ---- User -------------------------------------------------------------------

// UserRepository is the contract for User / auth persistence.
type UserRepository interface {
	GetByEmail(ctx context.Context, email string) (*models.User, error)
	GetByID(ctx context.Context, id string) (*models.User, error)
	Create(ctx context.Context, u *models.User) error
	Update(ctx context.Context, u *models.User) error
	ExistsByEmail(ctx context.Context, email string) (bool, error)
}

// ---- Connection -------------------------------------------------------------

// ConnectionRepository is the contract for DBConnection persistence.
type ConnectionRepository interface {
	List(ctx context.Context, userID string) ([]models.DBConnection, error)
	GetByID(ctx context.Context, id, userID string) (*models.DBConnection, error)
	Create(ctx context.Context, c *models.DBConnection) error
	Update(ctx context.Context, c *models.DBConnection) error
	Delete(ctx context.Context, id, userID string) error
}

// ---- DataAlert (threshold-based data alerts) --------------------------------

// DataAlertRepository is the contract for DataAlert persistence.
// Note: corresponds to the `data_alerts` table and models.DataAlert struct.
type DataAlertRepository interface {
	List(ctx context.Context, userID string) ([]models.DataAlert, error)
	GetByID(ctx context.Context, id, userID string) (*models.DataAlert, error)
	Create(ctx context.Context, a *models.DataAlert) error
	Update(ctx context.Context, a *models.DataAlert) error
	Delete(ctx context.Context, id, userID string) error
	// ToggleEnabled enables/disables an alert without a full update.
	ToggleEnabled(ctx context.Context, id, userID string, enabled bool) error
}

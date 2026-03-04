package storage

import (
	"context"
	"io"
)

// FileStorage is the interface for file storage backends.
type FileStorage interface {
	Upload(ctx context.Context, key string, r io.Reader, size int64, contentType string) error
	Download(ctx context.Context, key string) (io.ReadCloser, error)
	Delete(ctx context.Context, key string) error
	PresignedURL(ctx context.Context, key string) (string, error)
}

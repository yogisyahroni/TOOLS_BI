package storage

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// LocalStorage implements FileStorage using local filesystem.
type LocalStorage struct {
	baseDir string
}

// NewLocalStorage creates a new local storage client.
func NewLocalStorage(baseDir string) (*LocalStorage, error) {
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create local storage directory: %w", err)
	}
	return &LocalStorage{baseDir: baseDir}, nil
}

// Upload stores a file mapping to the local disk.
func (s *LocalStorage) Upload(ctx context.Context, key string, r io.Reader, size int64, contentType string) error {
	fullPath := filepath.Join(s.baseDir, key)
	if err := os.MkdirAll(filepath.Dir(fullPath), 0755); err != nil {
		return err
	}

	outFile, err := os.Create(fullPath)
	if err != nil {
		return err
	}
	defer outFile.Close()

	_, err = io.Copy(outFile, r)
	return err
}

// Download retrieves a file from local disk.
func (s *LocalStorage) Download(ctx context.Context, key string) (io.ReadCloser, error) {
	fullPath := filepath.Join(s.baseDir, key)
	return os.Open(fullPath)
}

// Delete removes a file from local disk.
func (s *LocalStorage) Delete(ctx context.Context, key string) error {
	fullPath := filepath.Join(s.baseDir, key)
	return os.Remove(fullPath)
}

// PresignedURL returns an error as it's not supported via direct URL securely.
func (s *LocalStorage) PresignedURL(ctx context.Context, key string) (string, error) {
	return "", fmt.Errorf("presigned URLs not natively supported via local storage without a dedicated endpoint")
}

package storage

import (
	"context"
	"fmt"
	"io"
	"net/url"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// MinIOStorage implements FileStorage using MinIO/S3.
type MinIOStorage struct {
	client *minio.Client
	bucket string
}

// NewMinIOStorage creates a new MinIO storage client and ensures the bucket exists.
func NewMinIOStorage(endpoint, accessKey, secretKey, bucket string, useSSL bool) (*MinIOStorage, error) {
	// Security: Validate and reconstruct the endpoint URL from scratch to break taint flow.
	u, err := url.Parse(endpoint)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return nil, fmt.Errorf("invalid or insecure minio endpoint: %s", endpoint)
	}
	cleanEndpoint := u.Host // Minio.New expects host:port or just host

	client, err := minio.New(cleanEndpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("minio client init: %w", err)
	}

	// Ensure bucket exists
	// Security: Use timed context for initialization
	initCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	exists, err := client.BucketExists(initCtx, bucket)
	if err != nil {
		return nil, fmt.Errorf("minio bucket check: %w", err)
	}
	if !exists {
		if err := client.MakeBucket(initCtx, bucket, minio.MakeBucketOptions{}); err != nil {
			return nil, fmt.Errorf("minio create bucket: %w", err)
		}
	}

	return &MinIOStorage{client: client, bucket: bucket}, nil
}

// Upload stores a file in MinIO.
func (s *MinIOStorage) Upload(ctx context.Context, key string, r io.Reader, size int64, contentType string) error {
	_, err := s.client.PutObject(ctx, s.bucket, key, r, size, minio.PutObjectOptions{
		ContentType: contentType,
	})
	if err != nil {
		return fmt.Errorf("minio upload %s: %w", key, err)
	}
	return nil
}

// Download retrieves a file from MinIO.
func (s *MinIOStorage) Download(ctx context.Context, key string) (io.ReadCloser, error) {
	obj, err := s.client.GetObject(ctx, s.bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, fmt.Errorf("minio download %s: %w", key, err)
	}
	return obj, nil
}

// Delete removes a file from MinIO.
func (s *MinIOStorage) Delete(ctx context.Context, key string) error {
	return s.client.RemoveObject(ctx, s.bucket, key, minio.RemoveObjectOptions{})
}

// PresignedURL generates a time-limited download URL.
func (s *MinIOStorage) PresignedURL(ctx context.Context, key string) (string, error) {
	u, err := s.client.PresignedGetObject(ctx, s.bucket, key, 24*time.Hour, nil)
	if err != nil {
		return "", fmt.Errorf("minio presign %s: %w", key, err)
	}
	return u.String(), nil
}

.PHONY: run build test lint clean migrate-up migrate-down docker docker-compose-up

# Default target
all: build

# Run the development server
run:
	go run ./cmd/server/...

# Build production binary
build:
	CGO_ENABLED=0 go build -ldflags="-w -s" -o bin/datalens ./cmd/server

# Run all tests with coverage
test:
	go test ./... -v -coverprofile=coverage.out -timeout 60s
	go tool cover -html=coverage.out -o coverage.html
	@echo "Coverage report: coverage.html"

# Run tests without race detector (faster)
test-fast:
	go test ./... -timeout 30s

# Run with race detector
test-race:
	go test -race ./... -timeout 60s

# Lint with golangci-lint
lint:
	golangci-lint run ./... --timeout 5m

# Format code
fmt:
	gofmt -w .
	goimports -w .

# Tidy go modules
tidy:
	go mod tidy

# Clean build artifacts
clean:
	rm -rf bin/ coverage.out coverage.html

# Build Docker image
docker:
	docker build -t datalens-api:latest .

# Start full stack with docker-compose
docker-compose-up:
	docker-compose up -d

# Stop full stack
docker-compose-down:
	docker-compose down

# View logs
docker-compose-logs:
	docker-compose logs -f api

# Security audit
audit:
	go list -json -m all | nancy sleuth
	govulncheck ./...

# Generate swagger docs
swagger:
	swag init -g cmd/server/main.go -o docs/

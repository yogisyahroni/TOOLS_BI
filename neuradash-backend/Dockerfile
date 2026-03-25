# syntax=docker/dockerfile:1
# === STAGE 1: Builder ===
FROM golang:1.24-alpine3.21 AS builder

# Install build dependencies (gcc for cgo, git for ldflags version tag)
RUN apk add --no-cache gcc musl-dev git

WORKDIR /app

# Copy module files first for layer caching
COPY go.mod go.sum ./
RUN go mod download

# Copy source
COPY . .

# Build the binary (CGO disabled for a fully static binary)
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-w -s -X main.version=$(git describe --tags --always 2>/dev/null || echo 'dev')" \
    -o bin/datalens ./cmd/server

# === STAGE 2: Runtime (distroless-style minimal image) ===
FROM alpine:3.21 AS runtime

RUN apk add --no-cache ca-certificates tzdata

# Create non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

WORKDIR /app

# Copy compiled binary
COPY --from=builder /app/bin/datalens .

# Run as non-root
USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD wget -qO- http://localhost:8080/health || exit 1

ENTRYPOINT ["./datalens"]

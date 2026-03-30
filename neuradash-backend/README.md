# NeuraDash Backend — Setup Guide

## Stack

| Layer        | Technology                           |
|--------------|--------------------------------------|
| Language     | Go 1.22                              |
| Framework    | Fiber v2                             |
| Database     | PostgreSQL 16 (GORM)                 |
| Cache        | Redis 7                              |
| File Storage | MinIO (S3-compatible)                |
| Auth         | JWT (access 15 min / refresh 7 days) |
| Realtime     | WebSocket Hub                        |
| Scheduler    | robfig/cron v3                       |

---

## Quick Start (Local)

### 1. Prerequisites

- Go 1.22+
- Docker & Docker Compose
- Node 20+ (for frontend)

### 2. Start infrastructure

```bash
docker-compose up -d
```

This starts:

- **PostgreSQL** on port `5432`
- **Redis** on port `6379`
- **MinIO** on port `9000` (console: `9001`)

### 3. Backend environment

Copy and configure `.env`:

```bash
cp datalens-backend/.env.example datalens-backend/.env
```

Key variables:

| Variable               | Default                                              | Description                        |
|------------------------|------------------------------------------------------|------------------------------------|
| `DATABASE_URL`         | `postgresql://postgres:1234@localhost:5432/datalens` | PostgreSQL connection string       |
| `REDIS_ADDR`           | `localhost:6379`                                     | Redis address                      |
| `JWT_SECRET`           | *(set a strong secret)*                              | JWT signing key                    |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173`                              | Frontend origin                    |
| `MINIO_ENDPOINT`       | `localhost:9000`                                     | MinIO endpoint                     |
| `MINIO_ACCESS_KEY`     | `minioadmin`                                         | MinIO access key                   |
| `MINIO_SECRET_KEY`     | `minioadmin`                                         | MinIO secret key                   |
| `AI_OPENAI_KEY`        | *(optional)*                                         | OpenAI API key for Ask Data        |
| `SERVER_PORT`          | `8080`                                               | API port                           |

### 4. Run backend

```bash
cd datalens-backend
go run ./cmd/server/
```

The server starts at `http://localhost:8080`.  
Migrations run automatically on startup.

### 5. Run frontend

```bash
npm install
npm run dev
```

Frontend starts at `http://localhost:5173`.

---

## API Overview

Base path: `/api/v1`

| Method | Path                       | Description                          |
|--------|----------------------------|--------------------------------------|
| POST   | `/auth/register`           | Register                             |
| POST   | `/auth/login`              | Login (returns JWT)                  |
| POST   | `/auth/refresh`            | Refresh token                        |
| GET    | `/datasets`                | List datasets                        |
| POST   | `/datasets/upload`         | Upload CSV/Excel                     |
| GET    | `/dashboards`              | List dashboards                      |
| POST   | `/dashboards`              | Create dashboard                     |
| GET    | `/connections`             | List DB connections                  |
| POST   | `/connections`             | Add external DB                      |
| POST   | `/connections/:id/test`    | Test connectivity                    |
| POST   | `/connections/:id/sync`    | Introspect schema                    |
| POST   | `/connections/:id/query`   | Run SQL (read-only)                  |
| GET    | `/import/supported`        | Supported file formats               |
| POST   | `/import/parse`            | Preview file import                  |
| POST   | `/import/confirm`          | Confirm import (save)                |

Full Swagger/OpenAPI documentation: *coming in Phase 17*.

---

## Supported External Databases (Phase 11)

| Database   | Notes                                                        |
|------------|--------------------------------------------------------------|
| PostgreSQL | Supabase, Neon, Railway, AWS RDS, Cloud SQL, CockroachDB     |
| MySQL      | MySQL 8, MariaDB, PlanetScale                                |
| SQL Server | Azure SQL, MSSQL 2019+                                       |
| SQLite     | File path via `host` field                                   |
| ClickHouse | ClickHouse Cloud, self-hosted                                |
| DuckDB     | Local `.duckdb` or `.db` files                               |

---

## ETL Resilience: Checkpoint & Auto-Resume

NeuraDash's ETL engine is built for reliability in distributed or "serverless" (Render/Heroku-style) environments:

- **Incremental Checkpointing**: Progress is persisted to the database after every successful batch processing.
- **Auto-Resume on Startup**: If the server restarts due to a cold-start, OOM, or manual deployment, any interrupted `running` pipelines will automatically resume from the last successful checkpoint.
- **Idempotent Upserts**: Ensures data consistency even if a batch is partially re-processed during recovery.
- **Dynamic Resource-Aware Chunking**: Automatically adjusts the ETL processing speed based on the server's **Available RAM** in real-time. This prevents Out-Of-Memory (OOM) crashes on constrained environments (like Render Free Tier) while maximizing throughput on high-spec servers.

---

## Supported Import Formats (Phase 10)

| Format           | Extension | What is extracted                        |
|------------------|-----------|------------------------------------------|
| Power BI         | `.pbix`   | Pages, visual types, data sources        |
| Tableau Workbook | `.twb`    | Worksheets, dashboards, data sources     |
| Tableau Packaged | `.twbx`   | Same as `.twb` (ZIP-wrapped)             |
| PowerPoint       | `.pptx`   | Slides as pages, charts, text            |

Max file size: **100 MB**.

---

## Running Tests

```bash
cd datalens-backend

# Unit tests (no DB required)
go test ./internal/engine/... ./internal/parser/... -v

# All tests
go test ./... -v
```

---

## Production Deployment Checklist

- [ ] Set `JWT_SECRET` to a 64-byte random string
- [ ] Set `SERVER_ENV=production`
- [ ] Configure PostgreSQL with SSL (`sslmode=require`)
- [ ] Point `MINIO_*` vars to your S3/MinIO instance
- [ ] Set `CORS_ALLOWED_ORIGINS` to your frontend URL
- [ ] Enable Redis AUTH (`REDIS_PASSWORD`)
- [ ] Run `go build -ldflags="-s -w" -o datalens-server ./cmd/server/`
- [ ] Deploy behind a reverse proxy (nginx/Caddy) with TLS

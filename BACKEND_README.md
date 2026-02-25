# DataLens — Go Backend Implementation Guide

## 📋 Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Getting Started](#getting-started)
5. [Database Schema](#database-schema)
6. [API Endpoints](#api-endpoints)
7. [WebSocket Realtime](#websocket-realtime)
8. [Data Refresh & Cron Jobs](#data-refresh--cron-jobs)
9. [Processing Engine](#processing-engine)
10. [Authentication & RLS](#authentication--rls)
11. [Deployment & Scaling](#deployment--scaling)
12. [Environment Variables](#environment-variables)
13. [Frontend Integration](#frontend-integration)

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                    FRONTEND (React/Vite)                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐│
│  │Dashboard │ │Charts    │ │Reports   │ │Data Refresh Panel││
│  │Builder   │ │Cross-flt │ │Stories   │ │(Realtime/Cron UI)││
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────────┬─────────┘│
│       │REST         │WS          │REST            │REST       │
└───────┼─────────────┼────────────┼────────────────┼──────────┘
        │             │            │                │
┌───────▼─────────────▼────────────▼────────────────▼──────────┐
│                    GO API GATEWAY                             │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌───────────┐ │
│  │ Fiber/Gin  │ │ WebSocket  │ │ Auth (JWT) │ │ Rate Limit│ │
│  │ REST API   │ │ Hub        │ │ Middleware │ │ Middleware│ │
│  └─────┬──────┘ └─────┬──────┘ └────────────┘ └───────────┘ │
│        │              │                                       │
│  ┌─────▼──────────────▼──────────────────────────────────┐   │
│  │              PROCESSING ENGINE                         │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │   │
│  │  │Aggregator│ │ETL Worker│ │Anomaly   │ │Calculated│ │   │
│  │  │(SUM,AVG) │ │Pipeline  │ │Detector  │ │Fields    │ │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────────────┐  │   │
│  │  │Cross-flt │ │Drill-down│ │Cron Scheduler        │  │   │
│  │  │Engine    │ │Engine    │ │(refresh/report/alert) │  │   │
│  │  └──────────┘ └──────────┘ └──────────────────────┘  │   │
│  └───────────────────────────────────────────────────────┘   │
└───────┬──────────────┬───────────────────────────────────────┘
        │              │
┌───────▼──────┐ ┌─────▼───────┐ ┌─────────────┐
│ PostgreSQL   │ │ Redis       │ │ S3/MinIO    │
│ - datasets   │ │ - cache     │ │ - file      │
│ - users      │ │ - pub/sub   │ │   storage   │
│ - reports    │ │ - sessions  │ │ - CSV/Excel │
│ - dashboards │ │ - job queue │ │   uploads   │
│ - cron_jobs  │ └─────────────┘ └─────────────┘
└──────────────┘
```

---

## Tech Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **HTTP Framework** | [Fiber](https://gofiber.io/) v2 | High-perf REST API (fasthttp) |
| **WebSocket** | [gorilla/websocket](https://github.com/gorilla/websocket) | Realtime push |
| **ORM** | [GORM](https://gorm.io/) | PostgreSQL ORM |
| **Cache** | [go-redis](https://github.com/redis/go-redis) | Caching + pub/sub |
| **Cron** | [robfig/cron](https://github.com/robfig/cron) | Scheduled jobs |
| **Auth** | [golang-jwt](https://github.com/golang-jwt/jwt) | JWT auth |
| **Math** | [gonum](https://github.com/gonum/gonum) | Statistics |
| **Config** | [viper](https://github.com/spf13/viper) | Configuration |
| **Migration** | [golang-migrate](https://github.com/golang-migrate/migrate) | DB migrations |
| **Logger** | [zerolog](https://github.com/rs/zerolog) | Structured logging |
| **File Parse** | [gocsv](https://github.com/gocarina/gocsv) + [excelize](https://github.com/qax-os/excelize) | CSV/Excel parsing |

---

## Project Structure

```
datalens-backend/
├── cmd/
│   └── server/
│       └── main.go                 # Entry point
├── internal/
│   ├── config/
│   │   └── config.go               # Env & config loading
│   ├── middleware/
│   │   ├── auth.go                  # JWT authentication
│   │   ├── cors.go                  # CORS headers
│   │   ├── ratelimit.go             # Rate limiting
│   │   └── rls.go                   # Row-Level Security
│   ├── models/
│   │   ├── user.go                  # User model
│   │   ├── dataset.go               # Dataset model
│   │   ├── dashboard.go             # Dashboard + widgets
│   │   ├── report.go                # Reports + stories
│   │   ├── chart.go                 # Saved charts
│   │   ├── kpi.go                   # KPI scorecard
│   │   ├── alert.go                 # Data alerts
│   │   ├── bookmark.go              # Bookmarks
│   │   ├── calculated_field.go      # Calculated fields
│   │   ├── relationship.go          # Data relationships
│   │   ├── rls_rule.go              # RLS rules
│   │   ├── parameter.go             # Parameters/variables
│   │   ├── annotation.go            # Chart annotations
│   │   ├── cron_job.go              # Cron/refresh config
│   │   └── pipeline.go             # ETL pipeline
│   ├── handlers/
│   │   ├── auth_handler.go          # Login, register, logout
│   │   ├── dataset_handler.go       # Upload, CRUD datasets
│   │   ├── query_handler.go         # SQL query execution
│   │   ├── dashboard_handler.go     # Dashboard CRUD
│   │   ├── report_handler.go        # Report generation
│   │   ├── chart_handler.go         # Chart CRUD
│   │   ├── kpi_handler.go           # KPI CRUD
│   │   ├── alert_handler.go         # Alert CRUD + check
│   │   ├── etl_handler.go           # ETL pipeline CRUD
│   │   ├── export_handler.go        # PDF/CSV/JSON export
│   │   ├── embed_handler.go         # Embed & share
│   │   ├── cron_handler.go          # Cron job management
│   │   ├── geo_handler.go           # Geo visualization
│   │   ├── pivot_handler.go         # Pivot table compute
│   │   ├── drilldown_handler.go     # Drill-down queries
│   │   ├── crossfilter_handler.go   # Cross-filter compute
│   │   └── ws_handler.go           # WebSocket handler
│   ├── engine/
│   │   ├── aggregator.go            # SUM, AVG, COUNT, etc.
│   │   ├── formula.go               # Calculated field eval
│   │   ├── etl_worker.go            # ETL pipeline executor
│   │   ├── anomaly.go               # Anomaly detection
│   │   ├── crossfilter.go           # Cross-filter engine
│   │   ├── drilldown.go             # Drill-down engine
│   │   ├── pivot.go                 # Pivot table engine
│   │   └── stats.go                 # Statistical functions
│   ├── scheduler/
│   │   ├── cron.go                  # Cron job scheduler
│   │   ├── refresh.go               # Data refresh worker
│   │   ├── report_gen.go            # Scheduled report gen
│   │   └── alert_check.go           # Scheduled alert check
│   ├── realtime/
│   │   ├── hub.go                   # WebSocket hub
│   │   ├── client.go                # WebSocket client
│   │   └── events.go                # Event types
│   ├── storage/
│   │   ├── s3.go                    # S3/MinIO file storage
│   │   └── local.go                 # Local file storage
│   └── repository/
│       ├── dataset_repo.go          # Dataset DB operations
│       ├── user_repo.go             # User DB operations
│       └── ...                      # Other repos
├── migrations/
│   ├── 001_create_users.up.sql
│   ├── 001_create_users.down.sql
│   ├── 002_create_datasets.up.sql
│   ├── 003_create_dashboards.up.sql
│   ├── 004_create_reports.up.sql
│   ├── 005_create_cron_jobs.up.sql
│   └── ...
├── docker-compose.yml
├── Dockerfile
├── Makefile
├── go.mod
├── go.sum
└── .env.example
```

---

## Getting Started

### Prerequisites

```bash
# Install Go 1.22+
go version  # go1.22+

# Install Docker & Docker Compose
docker --version
docker-compose --version
```

### Quick Start

```bash
# 1. Clone repo
git clone https://github.com/your-org/datalens-backend.git
cd datalens-backend

# 2. Copy env
cp .env.example .env
# Edit .env with your values

# 3. Start infra (PostgreSQL + Redis)
docker-compose up -d postgres redis

# 4. Run migrations
make migrate-up

# 5. Start server
make run
# Server starts at http://localhost:8080
# WebSocket at ws://localhost:8080/ws
```

### Docker Compose (Full Stack)

```yaml
# docker-compose.yml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "8080:8080"
    environment:
      - DATABASE_URL=postgres://datalens:secret@postgres:5432/datalens?sslmode=disable
      - REDIS_URL=redis://redis:6379/0
      - JWT_SECRET=${JWT_SECRET}
      - S3_ENDPOINT=${S3_ENDPOINT}
      - S3_ACCESS_KEY=${S3_ACCESS_KEY}
      - S3_SECRET_KEY=${S3_SECRET_KEY}
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: datalens
      POSTGRES_USER: datalens
      POSTGRES_PASSWORD: secret
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/data

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: datalens
      MINIO_ROOT_PASSWORD: datalens123
    volumes:
      - miniodata:/data

volumes:
  pgdata:
  redisdata:
  miniodata:
```

---

## Database Schema

### Core Tables

```sql
-- 001_create_users.up.sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100),
    role VARCHAR(20) DEFAULT 'viewer', -- admin, editor, viewer
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 002_create_datasets.up.sql
CREATE TABLE datasets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    file_name VARCHAR(255),
    columns JSONB NOT NULL DEFAULT '[]',
    row_count INTEGER DEFAULT 0,
    size_bytes BIGINT DEFAULT 0,
    storage_key TEXT, -- S3 key for raw file
    data_table_name VARCHAR(100), -- Dynamic table name for actual data
    refresh_config JSONB DEFAULT NULL, -- Cron/realtime config
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_datasets_user ON datasets(user_id);

-- 003_create_dashboards.up.sql
CREATE TABLE dashboards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    widgets JSONB NOT NULL DEFAULT '[]',
    is_public BOOLEAN DEFAULT FALSE,
    embed_token VARCHAR(64) UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 004_create_reports.up.sql
CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    dataset_id UUID REFERENCES datasets(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT,
    story TEXT,
    decisions JSONB DEFAULT '[]',
    recommendations JSONB DEFAULT '[]',
    chart_configs JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 005_create_cron_jobs.up.sql
CREATE TABLE cron_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'data_refresh', 'report_gen', 'alert_check', 'etl_run', 'export'
    target_id UUID, -- dataset_id, report_id, etc.
    schedule VARCHAR(100) NOT NULL, -- Cron expression: "*/5 * * * *"
    timezone VARCHAR(50) DEFAULT 'UTC',
    config JSONB DEFAULT '{}', -- Additional config per type
    enabled BOOLEAN DEFAULT TRUE,
    last_run_at TIMESTAMPTZ,
    last_status VARCHAR(20), -- 'success', 'error', 'running'
    last_error TEXT,
    next_run_at TIMESTAMPTZ,
    run_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cron_jobs_enabled ON cron_jobs(enabled, next_run_at);
CREATE INDEX idx_cron_jobs_user ON cron_jobs(user_id);

-- 006_create_saved_charts.up.sql
CREATE TABLE saved_charts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    dataset_id UUID REFERENCES datasets(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    type VARCHAR(20) NOT NULL, -- bar, line, pie, area, scatter, radar, funnel, treemap
    x_axis VARCHAR(100),
    y_axis VARCHAR(100),
    group_by VARCHAR(100),
    annotations JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 007_create_kpis.up.sql
CREATE TABLE kpis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    dataset_id UUID REFERENCES datasets(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    column_name VARCHAR(100) NOT NULL,
    aggregation VARCHAR(20) NOT NULL,
    target DECIMAL,
    unit VARCHAR(20),
    trend VARCHAR(10),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 008_create_alerts.up.sql
CREATE TABLE data_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    dataset_id UUID REFERENCES datasets(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    column_name VARCHAR(100) NOT NULL,
    condition VARCHAR(20) NOT NULL,
    threshold DECIMAL NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    triggered BOOLEAN DEFAULT FALSE,
    last_checked_at TIMESTAMPTZ,
    notify_via VARCHAR(20) DEFAULT 'websocket', -- websocket, email, webhook
    notify_target TEXT, -- email or webhook URL
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 009_create_etl_pipelines.up.sql
CREATE TABLE etl_pipelines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    source_dataset_id UUID REFERENCES datasets(id) ON DELETE CASCADE,
    output_dataset_id UUID REFERENCES datasets(id) ON DELETE SET NULL,
    steps JSONB NOT NULL DEFAULT '[]',
    status VARCHAR(20) DEFAULT 'idle',
    last_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 010_create_bookmarks.up.sql
CREATE TABLE bookmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    dataset_id UUID REFERENCES datasets(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    filters JSONB DEFAULT '[]',
    sort_column VARCHAR(100),
    sort_direction VARCHAR(4),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 011_create_calculated_fields.up.sql
CREATE TABLE calculated_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    dataset_id UUID REFERENCES datasets(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    formula TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 012_create_rls_rules.up.sql
CREATE TABLE rls_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    dataset_id UUID REFERENCES datasets(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL,
    column_name VARCHAR(100) NOT NULL,
    allowed_values JSONB NOT NULL DEFAULT '[]',
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 013_create_data_relationships.up.sql
CREATE TABLE data_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    source_dataset_id UUID REFERENCES datasets(id) ON DELETE CASCADE,
    target_dataset_id UUID REFERENCES datasets(id) ON DELETE CASCADE,
    source_column VARCHAR(100) NOT NULL,
    target_column VARCHAR(100) NOT NULL,
    rel_type VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 014_create_data_stories.up.sql
CREATE TABLE data_stories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    dataset_id UUID REFERENCES datasets(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    narrative TEXT,
    insights JSONB DEFAULT '[]',
    charts JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 015_create_parameters.up.sql
CREATE TABLE parameters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    dashboard_id UUID REFERENCES dashboards(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL, -- number, text, list, date
    default_value TEXT,
    min_val DECIMAL,
    max_val DECIMAL,
    options JSONB, -- for list type
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 016_create_audit_log.up.sql
CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    details JSONB,
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_log_user ON audit_log(user_id, created_at DESC);
```

---

## API Endpoints

### Authentication

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/auth/register` | Register new user |
| POST | `/api/v1/auth/login` | Login → JWT token |
| POST | `/api/v1/auth/logout` | Invalidate token |
| POST | `/api/v1/auth/refresh` | Refresh JWT |
| POST | `/api/v1/auth/forgot-password` | Password reset email |
| PUT | `/api/v1/auth/reset-password` | Set new password |
| GET | `/api/v1/auth/me` | Get current user |

### Datasets

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/datasets` | List user's datasets |
| POST | `/api/v1/datasets/upload` | Upload CSV/Excel |
| GET | `/api/v1/datasets/:id` | Get dataset metadata |
| GET | `/api/v1/datasets/:id/data` | Query data (pagination, filter, sort) |
| GET | `/api/v1/datasets/:id/stats` | Column statistics |
| DELETE | `/api/v1/datasets/:id` | Delete dataset |
| PUT | `/api/v1/datasets/:id/refresh-config` | Set refresh schedule |

### Dashboards

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/dashboards` | List dashboards |
| POST | `/api/v1/dashboards` | Create dashboard |
| PUT | `/api/v1/dashboards/:id` | Update dashboard |
| DELETE | `/api/v1/dashboards/:id` | Delete dashboard |
| POST | `/api/v1/dashboards/:id/embed` | Generate embed token |
| GET | `/api/v1/embed/:token` | Public embed view |

### Reports & Stories

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/reports` | List reports |
| POST | `/api/v1/reports/generate` | AI-generate report |
| DELETE | `/api/v1/reports/:id` | Delete report |
| GET | `/api/v1/stories` | List data stories |
| POST | `/api/v1/stories/generate` | AI-generate story |

### Charts

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/charts` | List saved charts |
| POST | `/api/v1/charts` | Save chart |
| PUT | `/api/v1/charts/:id` | Update chart |
| DELETE | `/api/v1/charts/:id` | Delete chart |
| POST | `/api/v1/charts/:id/annotations` | Add annotation |

### Analytics Engine

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/pivot` | Compute pivot table |
| POST | `/api/v1/drilldown` | Drill-down query |
| POST | `/api/v1/crossfilter` | Cross-filter compute |
| POST | `/api/v1/aggregate` | Custom aggregation |
| POST | `/api/v1/ask-data` | AI natural language query |
| POST | `/api/v1/geo/aggregate` | Geo aggregation |

### Cron / Data Refresh

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/cron-jobs` | List all cron jobs |
| POST | `/api/v1/cron-jobs` | Create cron job |
| PUT | `/api/v1/cron-jobs/:id` | Update cron job |
| DELETE | `/api/v1/cron-jobs/:id` | Delete cron job |
| POST | `/api/v1/cron-jobs/:id/run` | Trigger manual run |
| GET | `/api/v1/cron-jobs/:id/history` | Job run history |

### ETL Pipeline

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/pipelines` | List pipelines |
| POST | `/api/v1/pipelines` | Create pipeline |
| PUT | `/api/v1/pipelines/:id` | Update steps |
| POST | `/api/v1/pipelines/:id/run` | Execute pipeline |

### KPI & Alerts

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/kpis` | List KPIs |
| POST | `/api/v1/kpis` | Create KPI |
| PUT | `/api/v1/kpis/:id` | Update KPI |
| DELETE | `/api/v1/kpis/:id` | Delete KPI |
| GET | `/api/v1/alerts` | List alerts |
| POST | `/api/v1/alerts` | Create alert |
| PUT | `/api/v1/alerts/:id` | Update alert |
| POST | `/api/v1/alerts/check` | Force check all |

### Security & Settings

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/rls-rules` | List RLS rules |
| POST | `/api/v1/rls-rules` | Create RLS rule |
| PUT | `/api/v1/rls-rules/:id` | Toggle/update |
| DELETE | `/api/v1/rls-rules/:id` | Delete rule |
| GET | `/api/v1/bookmarks` | List bookmarks |
| POST | `/api/v1/bookmarks` | Save bookmark |
| DELETE | `/api/v1/bookmarks/:id` | Delete bookmark |
| GET | `/api/v1/calculated-fields` | List fields |
| POST | `/api/v1/calculated-fields` | Create field |
| DELETE | `/api/v1/calculated-fields/:id` | Delete field |
| GET | `/api/v1/parameters` | List parameters |
| POST | `/api/v1/parameters` | Create parameter |
| PUT | `/api/v1/parameters/:id` | Update value |

### Export

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/export/csv/:datasetId` | Export CSV |
| POST | `/api/v1/export/json/:datasetId` | Export JSON |
| POST | `/api/v1/export/markdown/:id` | Export Markdown |
| POST | `/api/v1/export/pdf/:id` | Export PDF (via headless Chrome) |

---

## WebSocket Realtime

### Connection

```javascript
// Frontend connection
const ws = new WebSocket('ws://localhost:8080/ws?token=JWT_TOKEN');

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  switch (msg.type) {
    case 'data_refresh':
      // Dataset was refreshed, reload data
      store.reloadDataset(msg.payload.datasetId);
      break;
    case 'alert_triggered':
      // Show alert notification
      toast({ title: msg.payload.alertName, description: msg.payload.message });
      break;
    case 'etl_complete':
      // ETL pipeline finished
      break;
    case 'report_ready':
      // Scheduled report generated
      break;
    case 'kpi_update':
      // KPI value changed
      break;
  }
};
```

### Go WebSocket Hub

```go
// internal/realtime/hub.go
package realtime

import "sync"

type Event struct {
    Type    string      `json:"type"`
    Payload interface{} `json:"payload"`
    UserID  string      `json:"-"` // target user
}

type Hub struct {
    clients    map[string]map[*Client]bool // userID -> clients
    broadcast  chan Event
    register   chan *Client
    unregister chan *Client
    mu         sync.RWMutex
}

func NewHub() *Hub {
    return &Hub{
        clients:    make(map[string]map[*Client]bool),
        broadcast:  make(chan Event, 256),
        register:   make(chan *Client),
        unregister: make(chan *Client),
    }
}

func (h *Hub) Run() {
    for {
        select {
        case client := <-h.register:
            h.mu.Lock()
            if _, ok := h.clients[client.UserID]; !ok {
                h.clients[client.UserID] = make(map[*Client]bool)
            }
            h.clients[client.UserID][client] = true
            h.mu.Unlock()

        case client := <-h.unregister:
            h.mu.Lock()
            if clients, ok := h.clients[client.UserID]; ok {
                delete(clients, client)
            }
            h.mu.Unlock()

        case event := <-h.broadcast:
            h.mu.RLock()
            if clients, ok := h.clients[event.UserID]; ok {
                for client := range clients {
                    client.Send(event)
                }
            }
            h.mu.RUnlock()
        }
    }
}

// SendToUser pushes an event to a specific user
func (h *Hub) SendToUser(userID string, event Event) {
    event.UserID = userID
    h.broadcast <- event
}
```

---

## Data Refresh & Cron Jobs

### Cron Job Types

| Type | Description | Example Schedule |
|------|------------|-----------------|
| `data_refresh` | Re-fetch data from source | `*/15 * * * *` (every 15 min) |
| `report_gen` | Auto-generate AI report | `0 8 * * 1` (Monday 8 AM) |
| `alert_check` | Check all alert thresholds | `*/5 * * * *` (every 5 min) |
| `etl_run` | Execute ETL pipeline | `0 2 * * *` (daily 2 AM) |
| `export_send` | Export & send via email | `0 9 * * 1` (Monday 9 AM) |
| `kpi_snapshot` | Snapshot KPI values | `0 * * * *` (every hour) |

### Refresh Modes

```go
// internal/models/cron_job.go
type RefreshMode string

const (
    RefreshRealtime  RefreshMode = "realtime"  // WebSocket push on change
    RefreshInterval  RefreshMode = "interval"  // Every N minutes
    RefreshScheduled RefreshMode = "scheduled" // Specific cron expression
    RefreshManual    RefreshMode = "manual"    // Only on-demand
)

type CronJob struct {
    ID          string      `json:"id" gorm:"primaryKey;type:uuid;default:gen_random_uuid()"`
    UserID      string      `json:"userId" gorm:"type:uuid;not null"`
    Name        string      `json:"name"`
    Type        string      `json:"type"` // data_refresh, report_gen, etc.
    TargetID    string      `json:"targetId" gorm:"type:uuid"`
    Schedule    string      `json:"schedule"` // Cron expression
    Timezone    string      `json:"timezone" gorm:"default:'UTC'"`
    Config      JSON        `json:"config" gorm:"type:jsonb"`
    Enabled     bool        `json:"enabled" gorm:"default:true"`
    LastRunAt   *time.Time  `json:"lastRunAt"`
    LastStatus  string      `json:"lastStatus"`
    LastError   string      `json:"lastError"`
    NextRunAt   *time.Time  `json:"nextRunAt"`
    RunCount    int         `json:"runCount" gorm:"default:0"`
    CreatedAt   time.Time   `json:"createdAt"`
    UpdatedAt   time.Time   `json:"updatedAt"`
}
```

### Scheduler Implementation

```go
// internal/scheduler/cron.go
package scheduler

import (
    "github.com/robfig/cron/v3"
    "datalens/internal/realtime"
)

type Scheduler struct {
    cron    *cron.Cron
    hub     *realtime.Hub
    repo    Repository
    jobs    map[string]cron.EntryID
}

func New(hub *realtime.Hub, repo Repository) *Scheduler {
    c := cron.New(cron.WithSeconds(), cron.WithLocation(time.UTC))
    return &Scheduler{cron: c, hub: hub, repo: repo, jobs: make(map[string]cron.EntryID)}
}

func (s *Scheduler) Start() {
    // Load all enabled jobs from DB
    jobs, _ := s.repo.GetEnabledJobs()
    for _, job := range jobs {
        s.RegisterJob(job)
    }
    s.cron.Start()
}

func (s *Scheduler) RegisterJob(job CronJob) {
    entryID, _ := s.cron.AddFunc(job.Schedule, func() {
        s.executeJob(job)
    })
    s.jobs[job.ID] = entryID
}

func (s *Scheduler) executeJob(job CronJob) {
    switch job.Type {
    case "data_refresh":
        s.refreshData(job)
    case "report_gen":
        s.generateReport(job)
    case "alert_check":
        s.checkAlerts(job)
    case "etl_run":
        s.runETL(job)
    case "export_send":
        s.exportAndSend(job)
    case "kpi_snapshot":
        s.snapshotKPIs(job)
    }
}

func (s *Scheduler) refreshData(job CronJob) {
    // 1. Fetch new data from source (API, DB, file)
    // 2. Update dataset in PostgreSQL
    // 3. Notify frontend via WebSocket
    s.hub.SendToUser(job.UserID, realtime.Event{
        Type: "data_refresh",
        Payload: map[string]string{
            "datasetId": job.TargetID,
            "status":    "completed",
        },
    })
}
```

### Cron Expression Quick Reference

```
┌──────── second (0-59)     [optional]
│ ┌────── minute (0-59)
│ │ ┌──── hour (0-23)
│ │ │ ┌── day of month (1-31)
│ │ │ │ ┌ month (1-12)
│ │ │ │ │ ┌ day of week (0-6, Sun=0)
│ │ │ │ │ │
* * * * * *

Examples:
"*/5 * * * *"     → Every 5 minutes
"0 * * * *"       → Every hour
"0 */2 * * *"     → Every 2 hours
"0 8 * * *"       → Daily at 8:00 AM
"0 8 * * 1"       → Monday at 8:00 AM
"0 8 * * 1-5"     → Weekdays at 8:00 AM
"0 0 1 * *"       → 1st of each month at midnight
"0 8,17 * * 1-5"  → Weekdays at 8 AM and 5 PM
```

---

## Processing Engine

### Aggregator Example

```go
// internal/engine/aggregator.go
package engine

type AggregateFunc string

const (
    Sum   AggregateFunc = "sum"
    Avg   AggregateFunc = "avg"
    Count AggregateFunc = "count"
    Min   AggregateFunc = "min"
    Max   AggregateFunc = "max"
)

type AggregateRequest struct {
    DatasetID string        `json:"datasetId"`
    GroupBy   []string      `json:"groupBy"`
    Metrics   []MetricDef   `json:"metrics"`
    Filters   []FilterDef   `json:"filters"`
}

type MetricDef struct {
    Column    string        `json:"column"`
    Function  AggregateFunc `json:"function"`
    Alias     string        `json:"alias"`
}

func (e *Engine) Aggregate(req AggregateRequest) ([]map[string]interface{}, error) {
    // Build optimized SQL query
    query := buildAggregateQuery(req)
    
    // Execute with connection pooling
    rows, err := e.db.Raw(query).Rows()
    if err != nil {
        return nil, err
    }
    defer rows.Close()
    
    // Stream results
    results := make([]map[string]interface{}, 0)
    for rows.Next() {
        row := make(map[string]interface{})
        rows.MapScan(row)
        results = append(results, row)
    }
    return results, nil
}
```

### Formula Evaluator (DAX-like)

```go
// internal/engine/formula.go
package engine

import (
    "go/ast"
    "go/parser"
    "math"
)

type FormulaEngine struct {
    functions map[string]FormulaFunc
}

type FormulaFunc func(args []float64) float64

func NewFormulaEngine() *FormulaEngine {
    e := &FormulaEngine{
        functions: make(map[string]FormulaFunc),
    }
    // Register built-in functions
    e.functions["SUM"] = func(args []float64) float64 {
        sum := 0.0
        for _, v := range args { sum += v }
        return sum
    }
    e.functions["AVG"] = func(args []float64) float64 {
        if len(args) == 0 { return 0 }
        sum := 0.0
        for _, v := range args { sum += v }
        return sum / float64(len(args))
    }
    e.functions["IF"] = func(args []float64) float64 {
        if len(args) >= 3 && args[0] != 0 { return args[1] }
        if len(args) >= 3 { return args[2] }
        return 0
    }
    e.functions["ROUND"] = func(args []float64) float64 {
        if len(args) < 2 { return math.Round(args[0]) }
        pow := math.Pow(10, args[1])
        return math.Round(args[0]*pow) / pow
    }
    return e
}

func (e *FormulaEngine) Evaluate(formula string, rowData map[string]interface{}) (float64, error) {
    // Parse and evaluate formula against row data
    // Supports: SUM(col), AVG(col), IF(cond, then, else), arithmetic
    // Implementation uses AST parsing for safety
    return 0, nil
}
```

---

## Authentication & RLS

### JWT Middleware

```go
// internal/middleware/auth.go
func AuthMiddleware(secret string) fiber.Handler {
    return func(c *fiber.Ctx) error {
        header := c.Get("Authorization")
        if header == "" {
            return c.Status(401).JSON(fiber.Map{"error": "Missing token"})
        }
        
        tokenStr := strings.TrimPrefix(header, "Bearer ")
        token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
            return []byte(secret), nil
        })
        
        if err != nil || !token.Valid {
            return c.Status(401).JSON(fiber.Map{"error": "Invalid token"})
        }
        
        claims := token.Claims.(jwt.MapClaims)
        c.Locals("userId", claims["sub"])
        c.Locals("role", claims["role"])
        return c.Next()
    }
}
```

### Row-Level Security Middleware

```go
// internal/middleware/rls.go
func RLSMiddleware(repo RLSRepository) fiber.Handler {
    return func(c *fiber.Ctx) error {
        userID := c.Locals("userId").(string)
        userRole := c.Locals("role").(string)
        datasetID := c.Params("datasetId")
        
        if datasetID == "" {
            return c.Next()
        }
        
        // Get RLS rules for this dataset + role
        rules, _ := repo.GetRules(datasetID, userRole)
        
        // Inject WHERE clauses into query context
        filters := buildRLSFilters(rules)
        c.Locals("rlsFilters", filters)
        
        return c.Next()
    }
}
```

---

## Deployment & Scaling

### Single Server (Small/Medium)

```bash
# Build
CGO_ENABLED=0 GOOS=linux go build -o datalens cmd/server/main.go

# Docker
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY . .
RUN CGO_ENABLED=0 go build -o /datalens cmd/server/main.go

FROM alpine:3.19
COPY --from=builder /datalens /datalens
EXPOSE 8080
CMD ["/datalens"]
# Image size: ~15MB
```

### Horizontal Scaling (Large)

```yaml
# kubernetes deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: datalens-api
spec:
  replicas: 3  # Scale horizontally
  template:
    spec:
      containers:
      - name: api
        image: datalens:latest
        resources:
          requests:
            memory: "64Mi"
            cpu: "100m"
          limits:
            memory: "256Mi"
            cpu: "500m"
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: datalens-secrets
              key: database-url
---
# HPA for auto-scaling
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
spec:
  scaleTargetRef:
    name: datalens-api
  minReplicas: 2
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        averageUtilization: 70
```

### Performance Benchmarks (Expected)

| Metric | Single Instance | 3 Instances |
|--------|----------------|-------------|
| Concurrent users | ~1,000 | ~3,000 |
| Requests/sec | ~10,000 | ~30,000 |
| Memory usage | ~30MB | ~90MB total |
| Dataset upload (100MB CSV) | ~3s | ~3s |
| Pivot table (1M rows) | ~500ms | ~500ms |
| WebSocket connections | ~10,000 | ~30,000 |

---

## Environment Variables

```bash
# .env.example

# Server
PORT=8080
ENV=production  # development, production

# Database
DATABASE_URL=postgres://user:pass@localhost:5432/datalens?sslmode=disable
DB_MAX_CONNECTIONS=50
DB_MAX_IDLE=10

# Redis
REDIS_URL=redis://localhost:6379/0

# JWT
JWT_SECRET=your-256-bit-secret
JWT_EXPIRY=24h
JWT_REFRESH_EXPIRY=168h  # 7 days

# Storage (S3/MinIO)
S3_ENDPOINT=localhost:9000
S3_ACCESS_KEY=your-access-key
S3_SECRET_KEY=your-secret-key
S3_BUCKET=datalens-uploads
S3_USE_SSL=false

# AI Provider (for reports, ask-data, stories)
AI_PROVIDER=openai  # openai, anthropic, openrouter
AI_API_KEY=sk-...
AI_MODEL=gpt-4o-mini
AI_MAX_TOKENS=4096

# Email (for scheduled reports)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=app-password

# Cron
CRON_ENABLED=true
CRON_TIMEZONE=Asia/Jakarta

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=60  # seconds

# CORS
CORS_ORIGINS=http://localhost:5173,https://yourdomain.com
```

---

## Frontend Integration

### API Client Setup

```typescript
// src/lib/api.ts
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1';

class ApiClient {
  private token: string | null = null;

  setToken(token: string) { this.token = token; }

  async request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...options?.headers,
      },
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  // Datasets
  getDatasets() { return this.request('/datasets'); }
  uploadDataset(file: File) {
    const form = new FormData();
    form.append('file', file);
    return this.request('/datasets/upload', { method: 'POST', body: form, headers: {} });
  }

  // Cron Jobs
  getCronJobs() { return this.request('/cron-jobs'); }
  createCronJob(job: CronJobInput) {
    return this.request('/cron-jobs', { method: 'POST', body: JSON.stringify(job) });
  }
  updateCronJob(id: string, updates: Partial<CronJobInput>) {
    return this.request(`/cron-jobs/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
  }
  triggerCronJob(id: string) {
    return this.request(`/cron-jobs/${id}/run`, { method: 'POST' });
  }
}

export const api = new ApiClient();
```

### WebSocket Integration

```typescript
// src/lib/websocket.ts
class RealtimeClient {
  private ws: WebSocket | null = null;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();

  connect(token: string) {
    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws';
    this.ws = new WebSocket(`${wsUrl}?token=${token}`);

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      const handlers = this.listeners.get(msg.type);
      handlers?.forEach(fn => fn(msg.payload));
    };

    this.ws.onclose = () => {
      setTimeout(() => this.connect(token), 3000); // Auto reconnect
    };
  }

  on(event: string, handler: (data: any) => void) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
    return () => this.listeners.get(event)?.delete(handler);
  }

  disconnect() { this.ws?.close(); }
}

export const realtime = new RealtimeClient();
```

---

## Makefile

```makefile
.PHONY: run build test migrate-up migrate-down docker

run:
	go run cmd/server/main.go

build:
	CGO_ENABLED=0 go build -o bin/datalens cmd/server/main.go

test:
	go test ./... -v -cover

migrate-up:
	migrate -path migrations -database "$(DATABASE_URL)" up

migrate-down:
	migrate -path migrations -database "$(DATABASE_URL)" down 1

docker:
	docker build -t datalens-api .

docker-up:
	docker-compose up -d

docker-down:
	docker-compose down

lint:
	golangci-lint run ./...

seed:
	go run cmd/seed/main.go
```

---

## Summary: DataLens vs Competitors

| Feature | Power BI | Tableau | Metabase | DataLens |
|---------|----------|---------|----------|----------|
| DAX / Calculated Fields | ✅ | ✅ LOD | ✅ Custom | ✅ AI-assisted |
| Drill-down | ✅ | ✅ | ✅ | ✅ |
| Geo Visualization | ✅ | ✅ | ✅ | ✅ |
| Scheduled Reports | ✅ | ✅ | ✅ | ✅ Cron + Realtime |
| Row-Level Security | ✅ | ✅ | ✅ | ✅ |
| Bookmarks | ✅ | ✅ | ❌ | ✅ |
| Conditional Formatting | ✅ | ✅ | ✅ | ✅ |
| Parameters | ✅ | ✅ | ❌ | ✅ |
| Cross-filter | ✅ | ✅ | ❌ | ✅ |
| Annotations | ❌ | ✅ | ❌ | ✅ |
| Embed / iFrame | ✅ | ✅ | ✅ | ✅ |
| Export | ✅ | ✅ | ✅ | ✅ |
| AI Reports | ❌ | ❌ | ❌ | ✅ 🏆 |
| AI Ask Data | ❌ | ✅ Ask Data | ❌ | ✅ 🏆 |
| AI Data Stories | ✅ Smart | ❌ | ❌ | ✅ 🏆 |
| Realtime WebSocket | ❌ | ❌ | ❌ | ✅ 🏆 |
| Self-hosted Go | ❌ | ❌ | ✅ Java | ✅ Go 🏆 |
| Docker < 20MB | ❌ | ❌ | ❌ | ✅ 🏆 |

---

**DataLens** — Enterprise BI powered by AI, built with Go. 🚀

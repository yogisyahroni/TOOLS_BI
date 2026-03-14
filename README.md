# DataLens - Enterprise AI Analytics Platform

DataLens is a full-stack, enterprise-grade Data Analytics and Business Intelligence (BI) platform. It empowers non-technical users to translate raw database records into strategic insights using advanced Artificial Intelligence (Natural Language to SQL).

Engineered for performance and scalability, the application leverages a high-performance **Golang** backend and a reactive **React/TypeScript** frontend. It is specifically designed to handle complex data workflows, ranging from raw data ingestion and ETL processing to automated AI-driven reporting.

---

## 🌟 Key Capabilities

### 1. AI-Powered Data Analyst (NL2SQL & AI Reports)
DataLens natively integrates with Large Language Models (LLMs) through a localized, intelligent data analyst.
- **AI Reports & AskData**: Natural language interface to query and generate reports instantly.
- **Context Grounding**: AI is injected with real database schemas and sample data rows, ensuring syntax-perfect SQL generation.
- **Streaming UI**: Uses Server-Sent Events (SSE) for a real-time, ChatGPT-like report generation experience.

### 2. Comprehensive Data Engineering (ETL & Modeling)
- **Visual ETL Pipeline**: A node-based builder to ingest, transform, and route data from CSV, JSON, or external connections.
- **Data Profiling & Modeling**: Automated schema analysis, data quality checks, and relationship mapping (DBDiagram).
- **Scheduled Refresh**: Cron-based data synchronization to keep dashboards up-to-date.

### 3. Professional Visualization Suite
- **Dashboard & Chart Builder**: Highly customizable drag-and-drop interface for building complex BI dashboards.
- **Geo-Visualization**: Advanced spatial mapping with support for geographical data layering.
- **Pivot Tables & KPI Scorecards**: Deep-dive analysis tools for enterprise metrics.

### 4. Advanced Security & Governance
- **Zero-Trust Auth**: Short-lived JWTs (Access Tokens) with Redis-backed, HTTP-Only Refresh Cookies.
- **AES-256 Encryption**: Encrypted storage for sensitive API keys (OpenAI, DB Credentials).
- **Row-Level Security (RLS)**: Enforces data access policies directly at the API layer.
- **Data Privacy Ops**: Tools for managing data sensitivity and compliance.

---

## 🏗️ Technical Architecture

### Backend (Golang)
- **Engine**: [Fiber v2](https://gofiber.io/) - High-performance Fasthttp-based framework.
- **API Standards**: Hybrid implementation of **REST** and **GraphQL** ([Gqlgen](https://gqlgen.com/)).
- **ORM**: [GORM](https://gorm.io/) with PostgreSQL.
- **Infrastructure**: **Redis** for caching/sessions and **MinIO/S3** for file storage.

### Frontend (React & TypeScript)
- **Core**: Vite-powered React 18+ app with Tailwind CSS.
- **UI/UX**: [Shadcn UI](https://ui.shadcn.com/) designed with glass-morphism and premium spacing.
- **State Management**: **TanStack Query** (Server State) + **Zustand** (Client State).
- **Interaction**: Framer Motion for micro-animations and micro-interactions.

---

## 📂 Project Structure

```text
.
├── datalens-backend/      # Go Fiber API, GraphQL Schemas, & AI Logic
│   ├── cmd/server/        # Entry point
│   ├── internal/          # Core logic (handlers, models, services)
│   └── migrations/        # SQL migration files
├── src/                   # React Frontend Source
│   ├── components/        # Reusable UI components & Layouts
│   ├── hooks/             # Custom React Hooks (Sidebar, GraphQL, Auth)
│   ├── pages/             # Managed BI Feature Pages (ETL, Dashboard, etc.)
│   └── lib/               # Infrastructure logic (API client, utils)
└── README.md
```

---

## 🚀 Deployment & Local Setup

### System Requirements
- **Go** 1.23+
- **Node.js** 18+
- **PostgreSQL** & **Redis**

### Quick Start

1. **Backend**:
   ```bash
   cd datalens-backend
   cp .env.example .env
   go mod tidy
   go run cmd/server/main.go
   ```

2. **Frontend**:
   ```bash
   npm install
   npm run dev
   ```

*Default endpoints: Frontend `http://localhost:5173`, API `http://localhost:8080`*

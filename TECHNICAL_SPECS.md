# Technical Specifications: Enterprise BI Resilience & AI ETL

This document defines the architectural improvements made to resolve the "Belum clear" technical gaps regarding Orchestration, Failure Handling, and Data Quality.

## 1. Orchestration & Resilience (Backend)

We leverage an internal Go-based scheduler instead of external system dependencies (like Linux Cron) to ensure cross-platform compatibility and deep integration with application state.

### 1.1 Scheduler Architecture
- **Engine**: `robfig/cron/v3` (standard high-reliability cron library for Go).
- **Control Layer**: Custom `Scheduler` wrapper in `datalens-backend/internal/scheduler/cron.go`.
- **Concurrency**: Thread-safe job management using `sync.RWMutex`.

### 1.2 Failure Handling (The Iron Hand)
Every job execution follows a strict resilience protocol:
1. **Panic Recovery**: Every job is wrapped in a `defer recover()` block to prevent a single faulty task from crashing the entire backend process.
2. **Exponential Backoff Retries**: 
   - Retries are calculated as `delay * 2^(retry_count-1)`.
   - Prevents cascading failures in downstream systems (throttling).
3. **Structured Logging**: Uses `slog` with contextual IDs for trace correlation.

---

## 2. Exploratory AI ETL (Frontend)

The AI ETL flow has been upgraded from "Procedural Scripting" to "Discovery-Driven Exploration".

### 2.1 Refined Workflow
- **State Synchronization**: The AI Assistant now has full visibility of the "Selected Source" schema and the current "Draft Steps".
- **Non-Destructive Exploration**: Changes proposed by the AI are applied to a `draftSteps` layer, allowing users to preview results before overwriting existing saved pipelines.
- **Enterprise Persona**: The system prompt (`getAIPrompt`) enforces a data-engineering mindset, prioritizing valid JSON output and semantic awareness of table columns.

---

## 3. Data Quality & Performance

### 3.1 In-Flight Validation
Data quality is enforced during the ETL execution within the browser:
- **Type Checking**: Automatic casting during transformation steps (e.g., date parsing, numeric aggregation).
- **Simulation Layer**: Transformations are processed in **Web Workers** to maintain a 60FPS UI even when processing 50,000+ rows locally.

### 3.2 UI/UX Excellence
- **Dark Mode Visibility**: Fixed `recharts` styling where value labels were invisible in dark mode (switched to `text-foreground` tokens).
- **TACTILE FEEDBACK**: Added staggering animations to the ETL step list and Donut charts for a "premium" feel.

---

## 4. Security Hardening
- **Stateless Verification**: All sensitive operations are guarded by Supabase Auth JWTs.
- **Environment Safety**: Secrets are purely injected via `.env` / Render Env Vars; no hardcoded credentials exist in the source.
- **Input Sanitization**: AI-generated JSON is validated against Zod schemas before being injected into the transformation engine.

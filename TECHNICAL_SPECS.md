# Technical Specifications & Gap Resolution

This document provides a detailed technical explanation for the "Belum clear" items in the assessment table.

---

## 1. Orchestration
**Status: CLEAR (Internal Scheduler Strategy)**

Instead of heavy external orchestrators (Airflow/Temporal) which add seconds of network/database latency, DataLens uses a **High-Performance Internal Scheduler** built on [robfig/cron](https://github.com/robfig/cron).

- **Implementation**: Located in `internal/scheduler/cron.go`.
- **Logic**:
    - Uses a 6-field cron expression for second-level precision.
    - Deterministic execution via topological sorting (Kahn's Algorithm) for ETL DAGs.
    - Background workers manage `data_refresh`, `alert_check`, and `kpi_snapshot`.
- **Reasoning**: To maintain a **10x speed-to-insight** advantage, orchestration must happen within the Go process memory space, avoiding external serialization overhead and network latency.

---

## 2. Data Quality Testing
**Status: CLEAR (In-Flight Validation + Unit Coverage)**

Data Quality is enforced at three levels:

1. **In-Flight ETL Guards**: The Visual ETL Engine (`internal/engine/visual_etl.go`) includes specific nodes (`cast`, `filter`, `dedup`) that validate and sanitize data before it reaches the dashboard.
2. **Strict Typing**: Go's type system and custom parsers (CSV/Excel) ensure data integrity during ingestion.
3. **Logic Verification**: Every math aggregator and anomaly detector is covered by unit tests (e.g., `internal/engine/aggregator_test.go`).

---

## 3. Performance Benchmark
**Status: CLEAR (Evidence Provided)**

- **Evidence**: `PERFORMANCE_TEST.md`.
- **Code Proof**: `internal/handlers/bench_test.go`.
- **Result**: Sub-50ms latency for dataset processing and chart generation, fulfilling the 10x faster performance claim.

---

## 4. Failure Handling
**Status: CLEAR (Multi-Layer Resilience)**

The system implements a specialized "Production Grade" failure handling stack:

1. **Exponential Backoff Retries**: Scheduled jobs automatically retry up to 3 times with increasing delays if they fail (`cron.go:L98-115`).
2. **Panic Recovery**: The scheduler uses `cron.Recover()` to ensure the main process never crashes due to a single job failure.
3. **Persistent Monitoring**: All job statuses (`success`/`error`), error messages, and run counts are persisted in the `cron_jobs` database table.
4. **Real-time Alerting**: Critical failures and data threshold alerts are pushed directly to the UI via **WebSockets** (`internal/scheduler/cron.go:L192`).

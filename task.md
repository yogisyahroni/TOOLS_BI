# Task List: NeuraDash Autonomous Intelligence (v2.0)

## Phase 1: Foundation & Data Architecture

- [x] **Database Schema Update**
  - [x] Update `models/user_ai_config.go` untuk mendukung `NotificationTargets` (array of contact objects: WhatsApp, Telegram, Email).
  - [x] Update `models/user_ai_config.go` untuk mendukung `IntegrationConnectors` (Dynamic system registry).
  - [x] Migrasi database untuk menerapkan perubahan skema baru.
- [x] **Infrastructure: Notification Service**
  - [x] Buat `internal/services/notification_service.go`.
  - [x] Implementasi Telegram Bot integration (send message logic).
  - [x] Implementasi Mailer integration (SMTP/SendGrid).
  - [x] Implementasi WhatsApp API interface (modular provider).
- [x] **Infrastructure: Action/Integration Service**
  - [x] Buat `internal/services/integration_service.go` untuk memvalidasi dan mengeksekusi request ke sistem eksternal (SAP, Odoo, custom).

## Phase 2: Intelligence Layer (S++ AI Agent Extensions)

- [x] **Tool Schema Definitions**
  - [x] Implement `validate_data_integrity` tool definition in `ai_handler.go`.
  - [x] Implement `investigate_anomaly` tool definition in `ai_handler.go`.
  - [x] Implement `execute_workflow_action` tool definition in `ai_handler.go`.
- [x] **Global Synthesis Logic**
  - [x] Implement `BuildGlobalSchemaContext` di `ai_service.go` untuk menangkap seluruh dataset uiser.
  - [x] Update `BuildAskDataPrompt` & `BuildReportPrompt` di `ai_prompts.go` untuk menyertakan context global.
  - [x] Sharpen `SystemPromptDataAnalyst` untuk "Auto-Join" intuition & autonomous causal reasoning.
- [x] **Autonomous Execution**
  - [x] Refine `AnalyzeAnomaly` in `ai_service.go` to execute secondary SQL queries internally if needed.

## Phase 3: Automation & Self-Healing

- [x] **Triggered Analysis Integration**
  - [x] Modifikasi `CronHandler.execAlertCheck`: Loop & evaluate alert thresholds.
  - [x] Trigger `AIService.AnalyzeAnomaly` asynchronously on breach.
  - [x] Hubungkan hasil investigasi ke `NotificationService` untuk dikirim ke daftar target dinamis.
- [x] **Self-Healing Sentinel Job**
  - [x] Tambahkan tipe job `data_validation` ke `CronHandler`.
  - [x] Implementasi logic `execDataValidation` menggunakan `DatasetService.CheckSchemaDrift`.
  - [x] Kirim peringatan/notifikasi jika drift terdeteksi.

## Phase 4: Frontend UI & Experience

- [x] **Live Forensic Integration**
  - [x] Backend: Broadcast `kpi_alert_tripped` & `investigation_completed` via WS Hub.
# Task List: NeuraDash Autonomous Intelligence (v2.0)

## Phase 1: Foundation & Data Architecture

- [x] **Database Schema Update**
  - [x] Update `models/user_ai_config.go` untuk mendukung `NotificationTargets` (array of contact objects: WhatsApp, Telegram, Email).
  - [x] Update `models/user_ai_config.go` untuk mendukung `IntegrationConnectors` (Dynamic system registry).
  - [x] Migrasi database untuk menerapkan perubahan skema baru.
- [x] **Infrastructure: Notification Service**
  - [x] Buat `internal/services/notification_service.go`.
  - [x] Implementasi Telegram Bot integration (send message logic).
  - [x] Implementasi Mailer integration (SMTP/SendGrid).
  - [x] Implementasi WhatsApp API interface (modular provider).
- [x] **Infrastructure: Action/Integration Service**
  - [x] Buat `internal/services/integration_service.go` untuk memvalidasi dan mengeksekusi request ke sistem eksternal (SAP, Odoo, custom).

## Phase 2: Intelligence Layer (S++ AI Agent Extensions)

- [x] **Tool Schema Definitions**
  - [x] Implement `validate_data_integrity` tool definition in `ai_handler.go`.
  - [x] Implement `investigate_anomaly` tool definition in `ai_handler.go`.
  - [x] Implement `execute_workflow_action` tool definition in `ai_handler.go`.
- [x] **Global Synthesis Logic**
  - [x] Implement `BuildGlobalSchemaContext` di `ai_service.go` untuk menangkap seluruh dataset uiser.
  - [x] Update `BuildAskDataPrompt` & `BuildReportPrompt` di `ai_prompts.go` untuk menyertakan context global.
  - [x] Sharpen `SystemPromptDataAnalyst` untuk "Auto-Join" intuition & autonomous causal reasoning.
- [x] **Autonomous Execution**
  - [x] Refine `AnalyzeAnomaly` in `ai_service.go` to execute secondary SQL queries internally if needed.

## Phase 3: Automation & Self-Healing

- [x] **Triggered Analysis Integration**
  - [x] Modifikasi `CronHandler.execAlertCheck`: Loop & evaluate alert thresholds.
  - [x] Trigger `AIService.AnalyzeAnomaly` asynchronously on breach.
  - [x] Hubungkan hasil investigasi ke `NotificationService` untuk dikirim ke daftar target dinamis.
- [x] **Self-Healing Sentinel Job**
  - [x] Tambahkan tipe job `data_validation` ke `CronHandler`.
  - [x] Implementasi logic `execDataValidation` menggunakan `DatasetService.CheckSchemaDrift`.
  - [x] Kirim peringatan/notifikasi jika drift terdeteksi.

## Phase 4: Frontend UI & Experience

- [x] **Live Forensic Integration**
  - [x] Backend: Broadcast `kpi_alert_tripped` & `investigation_completed` via WS Hub.
  - [x] Component: `AnomalyForensicsWidget` (Live feed of investigations).
  - [x] Layout: Integrasikan widget ke Dashboard utama.
- [x] **Real-time Alerting & Messaging**
  - [x] UI: Implementasi Toast listener global untuk alert kritis.
  - [x] Component: `DriftSentinelBanner` (Persistent top-bar for schema drift).

## Phase 5: Verification & Optimization (S++ Integrity Hardening)

- [x] **Integrity & Security Hardening**
  - [x] **Unique Key Priority**: Update `BuildGlobalSchemaContext` & prompts to enforce join on SKU/Resi/ID.
  - [x] **Action Safeguards**: Implement payload validation in `ExecutePrescriptiveAction`.
  - [x] **Rate-Limiting**: Implement cooldown for AI investigations in `AnalyzeAnomaly`.
- [x] **Advanced Verification Suite**
  - [x] **AI Integrity Test**: Verify join key selection in mock multi-dataset scenarios.
  - [x] **Notification Test**: Isolate and test `NotificationService` delivery.
- [x] **Performance Audit**
  - [x] Audit token usage and latency.
  - [x] Final audit keamanan pada eksekusi Action/Webhook.

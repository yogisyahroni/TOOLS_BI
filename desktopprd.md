# 📄 Product Requirements Document (PRD): Neuradash Desktop (Sentinel)

**Version:** 1.0  
**Framework:** Tauri (Rust + React)  
**Security Level:** Grade S++  
**Status:** Ready for Implementation

---

## 1. Vision & Objective

**Neuradash Desktop (Sentinel)** dirancang untuk memindahkan seluruh kapabilitas **Autonomous BI** dari browser ke lingkungan *native*. Tujuannya adalah memberikan performa yang lebih stabil, keamanan yang lebih ketat (Native Keychain), dan integrasi sistem operasi yang lebih mendalam tanpa mengurangi satu pun fitur yang sudah ada di versi Web.

---

## 2. Core Functional Parity (100% Web Features)

Aplikasi Desktop **WAJIB** mengimplementasikan seluruh fitur dari versi WebApp tanpa pengecekan:

### 2.1. Autonomous Strategic Intelligence

- **Forensic Anomaly Investigator:** Agen AI otonom untuk investigasi akar masalah (*root cause*).
- **Agentic AI Dashboard Builder:** Pembuatan dashboard melalui perintah bahasa alami (Streaming SSE).
- **5 Expert AI Personas:** Data Visualization Architect, Predictive Analyst, Financial Risk Expert, Anomaly Detection Specialist, dan NLP Sentiment Analyst.
- **Strategic Pillars:** Schema Sentinel, Self-Healing SQL, dan Prescriptive Workflow Engine.

### 2.2. Data Engineering & ETL

- **Visual ETL Node Engine:** Antarmuka drag-and-drop untuk pipeline data dengan *Atomic Checkpoint*.
- **Resource-Aware Processing:** Manajemen beban kerja cerdas untuk mencegah *Out-of-Memory* (OOM).
- **Proactive Data Profiling:** Ekstraksi wawasan otomatis (null distribution, categorical grouping, dll).

### 2.3. Analytics & Visualization

- **12-Column Responsive Matrix:** Canvas dashboard dengan kemampuan drag-and-drop & resize native.
- **High-Performance Geospatial:** MapLibre & Deck.gl untuk rendering jutaan data point spatial.
- **Interactive Drill-Downs:** Cross-filtering antar widget secara real-time.

---

## 3. Desktop Native Features (Exclusive)

Fitur tambahan yang diaktifkan melalui framework Tauri:

| Fitur | Deskripsi Teknis |
| :--- | :--- |
| **System Tray Support** | Berjalan di latar belakang dengan indikator status kesehatan data (Sentinel Health). |
| **Native Notifications** | Notifikasi OS untuk alert KPI Breach dengan tombol aksi cepat (Investigate/Dismiss). |
| **Local File Bridge** | Akses file lokal untuk upload dataset (CSV/Excel) secara langsung via sistem operasi. |
| **Auto-Export Sync** | Otomasi ekspor laporan (PDF/CSV) langsung ke direktori lokal yang ditentukan user. |
| **Multi-Windowing** | Membuka beberapa dashboard dalam jendela native terpisah untuk perbandingan data. |

---

## 4. Technical Architecture

### 4.1. Tech Stack

- **Frontend:** Shared codebase dengan WebApp (React 18, TypeScript, Vite, Tailwind).
- **Core Runtime:** Tauri (Rust) untuk keamanan dan efisiensi resource.
- **API Communication:** Terhubung ke Go Fiber Backend yang sudah ada via HTTPS/WSS.
- **Local Vault:** Native OS Keychain untuk penyimpanan JWT Token yang aman.

### 4.2. Performance Requirements

- **Startup Time:** < 2 detik.
- **Memory Usage:** < 150MB (idle).
- **CPU Usage:** Minimalis melalui pemrosesan Rust pada tugas berat I/O.

---

## 5. Security Hardening

- **Context Isolation:** Isolasi penuh antara proses UI (JavaScript) dan Core (Rust).
- **No-Node-Integration:** Menonaktifkan akses Node.js pada renderer untuk mencegah serangan XSS.
- **Binary Signing:** Installer harus ditandatangani secara digital untuk Windows (EV/OV Certificate) dan macOS (Notarization).

---

## 6. Implementation Plan

1. **Init:** Setup Tauri environment & shared component library.
2. **Bridge:** Implementasi Tauri commands untuk Auth & Native OS features.
3. **Parity:** Migrasi seluruh halaman React ke dalam Tauri window.
4. **Hardening:** Audit keamanan dan optimasi performa binary.

---

**Neuradash v2.0 - The Next Generation of Autonomous Strategic BI.**

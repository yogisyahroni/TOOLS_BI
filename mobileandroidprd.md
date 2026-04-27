# 📱 Product Requirements Document (PRD): Neuradash Mobile (Sentinel Mobile)

**Version:** 1.0  
**Platform:** Android Native (Kotlin/Jetpack Compose)  
**Security Level:** Grade S++  
**Target:** Enterprise SaaS

---

## 1. Vision & Objective

**Neuradash Mobile (Sentinel Mobile)** adalah pusat komando analitik dalam saku pengguna. Fokus utama adalah pada **Mobilitas, Respon Cepat, dan Keamanan Biometrik**. Aplikasi ini memungkinkan para eksekutif dan manajer untuk menerima hasil investigasi AI dan menyetujui tindakan strategis secara instan dari perangkat Android mereka.

---

## 2. Core Functional Parity (From WebApp)

Seluruh fitur inti analitik harus tersedia dalam versi Mobile dengan penyesuaian UX untuk layar sentuh:

### 2.1. Autonomous AI Interface

- **AI Forensic Feed:** Tampilan stream real-time hasil investigasi anomali.
- **Mobile AI Assistant:** Chat interface untuk bertanya tentang data menggunakan suara atau teks (NLP).
- **Prescriptive Action Approval:** Tombol satu-ketuk untuk menyetujui rekomendasi tindakan dari AI.

### 2.2. Visualization (Mobile Optimized)

- **Responsive KPI Scorecards:** Tampilan ringkas metrik utama perusahaan.
- **Micro-Charts:** Grafik yang dioptimalkan untuk layar kecil (Recharts/ECharts mobile wrapper).
- **Interactive Geo-Alerts:** Peta interaktif dengan notifikasi berbasis lokasi (jika relevan).

---

## 3. Mobile Native Features (The Edge)

Fitur yang memanfaatkan kapabilitas hardware Android:

| Fitur | Deskripsi Teknis |
| :--- | :--- |
| **Biometric Auth** | Integrasi Fingerprint/Face Unlock sebelum mengakses data sensitif perusahaan. |
| **Push Notifications** | Notifikasi real-time via Firebase (FCM) dengan *Deep-linking* ke detail anomali. |
| **Direct Sharing** | Berbagi dashboard atau temuan AI langsung ke WhatsApp, Slack, atau Telegram melalui Android Share Sheet. |
| **Offline Snapshot** | Menyimpan dashboard terakhir yang dibuka secara lokal (SQLite/Room) untuk akses tanpa internet. |
| **Voice Command** | Integrasi dengan asisten suara untuk pengecekan KPI tanpa mengetik. |

---

## 4. Onboarding & Billing (SaaS Strategy)

### 4.1. Registration & Login

- **Omni-platform Sign Up:** User bisa mendaftar langsung dari aplikasi Android.
- **SSO Integration:** Dukungan penuh untuk Google Workspace dan Microsoft Azure AD.
- **Org Auto-Discovery:** Menemukan organisasi berdasarkan domain email kantor.

### 4.2. Centralized Billing (The One-Gate Policy)

- Aplikasi Mobile **TIDAK** memproses transaksi kartu kredit secara langsung (untuk menghindari 30% App Store tax).
- Tombol **"Upgrade to Pro"** akan membuka browser eksternal yang terenkripsi ke halaman billing di WebApp.
- Status langganan akan disinkronkan secara real-time via WebSocket/API setelah pembayaran sukses di Web.

---

## 5. Technical Stack (Android Native)

- **Language:** Kotlin 1.9+.
- **UI Framework:** Jetpack Compose (Modern Declarative UI).
- **Architecture:** MVVM (Model-View-ViewModel) dengan Clean Architecture.
- **Networking:** Retrofit untuk REST API & OkHttp untuk WebSocket.
- **Local DB:** Room Database untuk caching.

---

## 6. Security Hardening

- **Certificate Pinning:** Mencegah serangan *Man-in-the-Middle* (MitM).
- **Screenshot Protection:** Opsional (bisa diaktifkan untuk layar data sangat rahasia).
- **Root Detection:** Aplikasi akan memberikan peringatan atau membatasi akses jika perangkat terdeteksi telah di-root.

---

**Neuradash Mobile - Command Your Data, Anywhere.**

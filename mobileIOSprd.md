# 🍎 Product Requirements Document (PRD): Neuradash for iOS (Sentinel iOS)

**Version:** 1.0  
**Platform:** iOS Native (Swift / SwiftUI)  
**Security Level:** Grade S++  
**Target:** Enterprise SaaS (Apple Ecosystem)

---

## 1. Vision & Objective

**Neuradash for iOS** menghadirkan pengalaman analitik otonom yang paling premium, mulus, dan aman bagi pengguna Apple. Mengikuti standar **Apple Human Interface Guidelines (HIG)**, aplikasi ini dirancang untuk eksekutif yang membutuhkan wawasan strategis instan dengan estetika visual yang setingkat dengan produk Apple.

---

## 2. Core Functional Parity (From WebApp)

Mempertahankan 100% fitur analitik inti dengan optimasi antarmuka iOS:

### 2.1. Autonomous AI Strategy

- **AI Forensic Timeline:** Feed investigasi anomali dalam format timeline yang intuitif.
- **Siri Integration (Intent):** Memungkinkan user bertanya "Hey Siri, berapa profit hari ini?" langsung ke Neuradash.
- **Agentic Recommendations:** Notifikasi interaktif untuk menyetujui langkah-langkah preventif dari AI.

### 2.2. Visualization (Premium UI)

- **SwiftUI Charts:** Grafik native iOS yang mendukung interaksi haptic.
- **Glassmorphic Widgets:** Dashboard widget yang bisa dipasang langsung di **iOS Home Screen** atau **Lock Screen**.
- **Interactive Geo-Spatial:** Integrasi Apple Maps untuk visualisasi data berbasis lokasi perusahaan.

---

## 3. iOS Native Features (The Apple Edge)

Fitur eksklusif untuk memaksimalkan ekosistem Apple:

| Fitur | Deskripsi Teknis |
| :--- | :--- |
| **FaceID / TouchID** | Keamanan biometrik tingkat tinggi via LocalAuthentication framework. |
| **Haptic Feedback** | Respon getaran halus (Haptic) saat ada KPI yang mencapai target atau saat terjadi anomali. |
| **Home Screen Widgets** | Menampilkan metrik kritis (KPI) langsung di layar utama iPhone tanpa buka aplikasi. |
| **Live Activities** | Memantau proses investigasi AI yang sedang berjalan langsung dari Lock Screen. |
| **Shared with You** | Integrasi dengan iMessage untuk berbagi dashboard antar rekan kerja. |

---

## 4. SaaS Onboarding & Billing Policy

### 4.1. Registration

- **Sign in with Apple:** Onboarding tercepat dan paling aman untuk pengguna iOS.
- **Organization Sync:** Integrasi dengan profil perusahaan yang terdaftar di Apple Business Manager.

### 4.2. Billing Hub (The Strategy)

- Sesuai dengan kebijakan Apple, aplikasi akan menampilkan fitur Pro.
- Tombol **"Manage Account"** akan mengarahkan pengguna ke sistem Billing terpusat di WebApp melalui **Safari View Controller**.
- Hal ini dilakukan untuk menjaga privasi transaksi dan memastikan **1:1 Billing Identity** di seluruh platform (Web, Desktop, Android, iOS).

---

## 5. Technical Stack (iOS Native)

- **Language:** Swift 5.10+.
- **UI Framework:** SwiftUI (Primary) & Combine for Reactive State.
- **Architecture:** MVVM-C (Model-View-ViewModel-Coordinator).
- **Persistence:** CoreData atau SwiftData untuk sinkronisasi offline.
- **Networking:** URLSession dengan dukungan HTTP/2 dan WSS.

---

## 6. Security & Privacy (Apple Standards)

- **App Tracking Transparency (ATT):** Transparansi penuh penggunaan data.
- **End-to-End Encryption:** Untuk data sensitif yang disimpan di iCloud Sync (jika diaktifkan).
- **Privacy Manifest:** Memenuhi syarat terbaru App Store mengenai privasi data user.

---

**Neuradash for iOS - The Pinnacle of Mobile Business Intelligence.**

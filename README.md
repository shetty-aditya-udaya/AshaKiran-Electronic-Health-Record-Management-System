# 🩺 AshaKiran — Electronic Health Record Management System

[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-18.2.0-blue.svg)](https://react.dev/)
[![Flask](https://img.shields.io/badge/Flask-3.0.0-green.svg)](https://flask.palletsprojects.com/)
[![PWA](https://img.shields.io/badge/PWA-Supported-purple.svg)](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)

**AshaKiran** ("Ray of Hope") is a production-grade, offline-first Electronic Health Record (EHR) and Progressive Web Application (PWA) tailored specifically for Accredited Social Health Activists (ASHA) and frontline healthcare workers operating in rural, low-connectivity regions of India. 

ASHA workers often deliver critical maternal care (ANC), child immunizations, and chronic illness screenings in remote areas where cellular networks are extremely poor or non-existent. AshaKiran solves this bottleneck by providing a highly robust, low-latency, and healthcare-compliant offline workspace that synchronizes flawlessly back to a centralized cloud system once network connectivity is restored.

---

## 🚀 Key Architectural Pillars

### 1. Robust Offline-First Sync Engine (Zero-Data-Loss Guarantee)
AshaKiran features a custom-built, transactional synchronization engine utilizing standard browser-level IndexedDB:
*   **Dexie.js Offline Database**: Implements structured local storage for patients, clinical visits, medical records, reminders, and prescription metadata.
*   **Web Locks API Mutex**: Employs browser-level synchronization locks to prevent write conflicts or race conditions across multiple open tabs or browser sessions.
*   **Outbox Queue Replay Pattern**: When offline, changes are safely accumulated in a local pending queue. Once network restoration is detected via dynamic connection monitoring, the sync worker executes a secure, sequential outbox replay to serialize changes to the Flask API.
*   **Optimistic UI Updates**: Instantly displays changes in the user interface, marking unsynced entries with temporary `⏳ Sync Pending` or `📡 Offline` indicators for worker clarity.

### 2. Multi-Tier Security & Healthcare Compliance
*   **Binary Magic-Bytes Checks**: Restricts document and prescription photo uploads by inspecting their actual binary structures (`JPEG`, `PNG`, `GIF`) rather than trusting file extensions, blocking malicious executable renames.
*   **Hardened Session Lifespans**: Implements silent JWT token refresh rotations behind the scenes, maintaining active sessions during poor or zero connectivity and preventing frustrating auto-logouts.
*   **Dynamic Production CORS**: Features configurable allowed-origin filters on Flask endpoints to safeguard sensitive patient healthcare profiles from Cross-Origin Resource Sharing vulnerabilities.

### 3. Real-Time Multilingual Localization (i18n)
*   **English & Hindi Support**: Offers deep, system-wide translation support across all pages, workflows, dashboard metrics, search forms, and patient timelines.
*   **Zero-Jitter Switcher**: Component logic accesses i18next dynamically using internal hooks, guaranteeing zero interface stutter or flash-of-untranslated-content (FUTC) upon changing language.

### 4. Interactive Healthcare Maps & Reminders
*   **Leaflet GIS Integration**: Dynamically maps clinics, hospitals, and ASHA tracking boundaries on coordinates.
*   **ANC & Immunization Reminders**: An automated scheduling calendar that generates community follow-up alerts, highlighting overdue visits to optimize maternal health outcomes.

---

## 🛠️ Technology Stack

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Frontend Core** | React 18 (Vite) | High-performance, components-driven UI structure. |
| **Styling** | Tailwind CSS | Sleek, harmonized premium healthcare dashboard layout. |
| **Local Storage** | Dexie.js & IndexedDB | Full relational schema for local transactional storage. |
| **Service Worker** | Vite PWA Plugin | Cache-handling for rapid asset loading & offline PWA capabilities. |
| **Backend API** | Flask (Python) | Modular REST endpoints with secure JWT auth middleware. |
| **Database ORM** | Flask-SQLAlchemy | Handles production fallbacks gracefully (MySQL / SQLite). |
| **GIS Mapping** | Leaflet.js | Map rendering for villages, clinics, and emergency routes. |

---

## ⚙️ Setup & Installation

### Prerequisites
*   Node.js (v18+)
*   Python (v3.10+)
*   npm or yarn

### 📁 1. Clone the Repository
```bash
git clone https://github.com/shetty-aditya-udaya/AshaKiran-Electronic-Health-Record-Management-System.git
cd AshaKiran-Electronic-Health-Record-Management-System
```

### 💻 2. Frontend Configuration & Setup
1.  Navigate to the frontend folder:
    ```bash
    cd frontend
    ```
2.  Install all dependencies:
    ```bash
    npm install
    ```
3.  Set up environment configurations:
    ```bash
    cp .env.example .env
    ```
4.  Run the local development server:
    ```bash
    npm run dev
    ```

### 🐍 3. Backend Flask Configuration & Setup
1.  Open a new terminal and navigate to the backend directory:
    ```bash
    cd backend
    ```
2.  Set up a virtual environment:
    ```bash
    python -m venv venv
    # Windows:
    .\venv\Scripts\activate
    # macOS/Linux:
    source venv/bin/activate
    ```
3.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```
4.  Set up environment configurations:
    ```bash
    cp .env.example .env
    ```
5.  Initialize the database and start the server:
    ```bash
    python run.py
    ```

---

## 📖 Multilingual File Structure

The localized assets are structured inside the frontend to ease extensibility:
```
frontend/src/i18n/
├── en.json  # English localization keys
└── hi.json  # Hindi localization keys
```
To contribute a new language (e.g., Marathi or Tamil), simply replicate the structure inside a new JSON file and register it inside the `i18n.js` configuration module.

---

## 🛡️ License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions from healthcare tech professionals, developers, and open-source advocates are highly welcomed! Please read [CONTRIBUTING.md](CONTRIBUTING.md) to understand our coding standards, security reporting workflows, and architectural patterns.

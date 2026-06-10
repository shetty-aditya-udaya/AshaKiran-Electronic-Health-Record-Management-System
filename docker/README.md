# AshaKiran Containerized Architecture & Orchestration

This directory houses the container settings and documentation for AshaKiran's production-grade Docker layout.

## Container Architecture Overview

AshaKiran uses a 3-tier container architecture designed to be isolated, resilient, and highly secure.

```
                  [ Clients (Browser / PWA) ]
                               │
                        Port 80 (HTTP)
                               ▼
        ┌──────────────────────────────────────────────┐
        │        frontend (Nginx Reverse Proxy)        │
        └──────┬────────────────────────────────┬──────┘
               │                                │
        Routes to API                    Serves static
         (/api/*)                         React files
               │                                │
               ▼                                ▼
┌──────────────────────────────┐       ┌────────────────┐
│  backend (Flask + Gunicorn)  │       │  Static Files  │
└──────────────┬───────────────┘       │  (Vite Build)  │
               │                       └────────────────┘
        Connects via TCP
        (Port 5432)
               ▼
┌──────────────────────────────┐
│     db (PostgreSQL 15)       │
└──────────────────────────────┘
```

### 1. Database Tier (`db`)
- **Image:** `postgres:15-alpine` (lightweight, secure Alpine base)
- **Role:** Primary persistent data store for clinical records, patient files, and users.
- **Port:** Internal only (`5432`). Exposing the database port to the host is intentionally disabled in production to prevent external intrusion.
- **Volume:** `db_data` is mounted to `/var/lib/postgresql/data` to ensure data persists across container lifecycles.
- **Resource Constraints:** Restricted to a maximum of 0.5 CPU core and 512MB RAM to prevent noisy-neighbor memory issues on low-cost hosting servers.

### 2. Application API Tier (`backend`)
- **Base Image:** `python:3.11-slim` (minimal image to keep footprint small).
- **WSGI Server:** Runs using Gunicorn with optimized thread pools for low-RAM containers.
- **Security:**
  - **Non-Root Execution:** Runs under a secure non-privileged user `flaskuser` (UID/GID `10001`) instead of `root`.
  - **Environment Variables:** All sensitive keys (JWT secrets, DB passwords, Flask environment) are injected dynamically.
- **Health Verification:** Uses Python's built-in `urllib.request` library to perform a secure loopback check on the `/health` endpoint.

### 3. Edge / Presentation Tier (`frontend`)
- **Base Image:** `nginx:1.25-alpine` (highly optimized reverse proxy).
- **Roles:**
  - **Static Host:** Serves fingerprinted React production builds directly from Nginx's default root directory with dynamic `gzip` compression and aggressive 1-year immutable caching rules for assets.
  - **Reverse Proxy:** Maps `/api` requests to the `backend` container using container hostname resolution (`http://backend:5000`), automatically stripping duplicate headers.
  - **PWA Bypass:** Implements strict `Cache-Control: no-store` headers on `sw.js` and `manifest.webmanifest` to ensure clients never cache outdated service workers.
- **Health Verification:** Runs a periodic `wget` spider request to ensure Nginx is healthy and the reverse proxy is responding.

---

## Volume Persistence Reference

The following Docker volumes are declared in `docker-compose.yml` to preserve system state:

| Volume Name | Container Path | Purpose |
| :--- | :--- | :--- |
| `db_data` | `/var/lib/postgresql/data` | Retains all PostgreSQL system tables and patient files. |
| `backend_uploads` | `/app/uploads` | Stores clinic files, documents, and profile pictures. |
| `backend_logs` | `/app/logs` | Collects runtime warning, audit, and debug logs. |
| `backend_instance` | `/app/instance` | Fallback SQLite storage location (if PostgreSQL database is absent). |

---

## Health Check Mechanics

To ensure zero downtime, the services orchestrate startup sequence depending on health states:

1. **Database Check:**
   `pg_isready -U postgres -d ashakiran` checks if PostgreSQL is accepting connections.
2. **Backend Check:**
   `python -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/health')"` ensures the WSGI thread is active.
3. **Frontend Check:**
   `wget --quiet --tries=1 --spider http://localhost/health || exit 1` ensures Nginx is healthy and can reach the backend.

The `backend` service starts only after `db` is **healthy**. The `frontend` service starts only after `backend` is **healthy**.

---

## Essential Commands

Always run these commands from the root directory of the project.

### Spin Up Containers (Build Mode)
Builds images and runs them in the background (detached mode):
```bash
docker compose up --build -d
```

### Shut Down Containers
Stops the container stack and tear down the bridge networks:
```bash
docker compose down
```

### Remove Containers and Clean Volumes
Stops containers and destroys persistent volume storage (caution: deletes database data!):
```bash
docker compose down -v
```

### View Real-time Container Logs
Follow output logs of all services in real time:
```bash
docker compose logs -f
```

### View Status & Health Checks
Inspect the current state, ports, and health checks of the active containers:
```bash
docker compose ps
```

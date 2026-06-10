import os
import logging
import time
import json
import sys
from datetime import datetime
from logging.handlers import RotatingFileHandler
from flask import Flask, jsonify, request, make_response
from flask_sqlalchemy import SQLAlchemy
from config import Config
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST

db = SQLAlchemy()

# ── Prometheus Metrics ────────────────────────────────────────────────────────
REQUEST_COUNT = Counter('flask_request_count', 'App Request Count', ['method', 'endpoint', 'http_status'])
REQUEST_LATENCY = Histogram('flask_request_latency_seconds', 'Request latency', ['method', 'endpoint'])

# ── Logging ───────────────────────────────────────────────────────────────────
_log_dir = os.path.join(os.path.dirname(__file__), '..', 'logs')
os.makedirs(_log_dir, exist_ok=True)
_log_path = os.path.join(_log_dir, 'backend.log')

_handler = RotatingFileHandler(_log_path, maxBytes=5_000_000, backupCount=3)
_handler.setLevel(logging.WARNING)
_handler.setFormatter(logging.Formatter('%(asctime)s %(levelname)s %(name)s: %(message)s'))
logging.getLogger().addHandler(_handler)
log = logging.getLogger(__name__)

# Add stdout stream handler for Docker log capture
_stream_handler = logging.StreamHandler(sys.stdout)
_stream_handler.setLevel(logging.WARNING)
_stream_handler.setFormatter(logging.Formatter('%(asctime)s %(levelname)s %(name)s: %(message)s'))
logging.getLogger().addHandler(_stream_handler)

# ── Allowed CORS origins ───────────────────────────────────────────────────────
# In production, set ALLOWED_ORIGINS=https://yourdomain.com or CORS_ORIGINS=https://yourdomain.com
# In development, this defaults to localhost.
_RAW_ORIGINS = os.getenv("CORS_ORIGINS") or os.getenv("ALLOWED_ORIGINS") or "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173"
_ALLOWED_ORIGINS = {o.strip().rstrip('/') for o in _RAW_ORIGINS.split(",") if o.strip()}

def _is_allowed_origin(origin: str) -> bool:
    if not origin:
        return False
    # Strip trailing slash just in case
    clean_origin = origin.rstrip('/')
    
    # Allow allowed origins and "null" origin (common in mobile WebViews / PWA standalone modes)
    if clean_origin in _ALLOWED_ORIGINS or clean_origin == "null":
        return True
        
    # In development mode, also allow local developer ports
    if os.getenv("FLASK_ENV") != "production":
        if clean_origin.startswith("http://localhost:") or clean_origin.startswith("http://127.0.0.1:"):
            return True
            
    return False


def create_app():
    # ── Sentry Exception Tracking Setup ──
    sentry_dsn = os.getenv("SENTRY_DSN")
    if sentry_dsn:
        try:
            import sentry_sdk
            from sentry_sdk.integrations.flask import FlaskIntegration
            sentry_sdk.init(
                dsn=sentry_dsn,
                integrations=[FlaskIntegration()],
                traces_sample_rate=1.0,
                profiles_sample_rate=1.0,
            )
            print("SENTRY MONITORING: Initialized successfully!")
        except Exception as err:
            print(f"SENTRY MONITORING ERROR: Failed to initialize Sentry! {err}", file=sys.stderr)

    app = Flask(__name__)
    app.config.from_object(Config)

    # Security: limit request body size to 16MB (prevents disk-fill attacks on upload)
    app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16 MB

    # ── Auto-create required folders safely ──
    BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    REQUIRED_DIRS = [
        "instance",
        "uploads",
        "uploads/profile_pics",
        "uploads/documents",
        "temp",
        "reports",
        "exports"
    ]
    for folder in REQUIRED_DIRS:
        os.makedirs(os.path.join(BASE_DIR, folder), exist_ok=True)

    db.init_app(app)

    # ── Database Diagnostics & Handshake ──
    with app.app_context():
        # Ensure database tables exist automatically
        db.create_all()

        # Seed default clinician user (Priya Devi) automatically on startup if empty
        try:
            from app.models import User
            import bcrypt
            if not User.query.filter_by(email="priya@asha.in").first():
                hashed = bcrypt.hashpw("password123".encode(), bcrypt.gensalt()).decode()
                user = User(name="Priya Devi", email="priya@asha.in", password=hashed, village="Gopalpur")
                db.session.add(user)
                db.session.commit()
                print("SEEDING: Default clinician user 'priya@asha.in' seeded successfully!")
        except Exception as seed_err:
            print(f"SEEDING WARNING: Failed to seed default user: {seed_err}")

        try:
            uri = app.config.get("SQLALCHEMY_DATABASE_URI", "")
            from sqlalchemy.engine.url import make_url
            parsed_url = make_url(uri)
            dialect = parsed_url.drivername
            host = parsed_url.host or "local"
            db_name = parsed_url.database or "default"
            
            # Execute active database handshake
            with db.engine.connect() as conn:
                conn.execute(db.text("SELECT 1"))
            
            ssl_enabled = "mysql" in dialect
            ssl_state = "Enabled (ca.pem)" if ssl_enabled else "Disabled/Not Applicable for SQLite"
            flask_env = os.getenv("FLASK_ENV", "development")
            debug_mode = app.config.get("DEBUG", False)

            # Startup print statements as requested
            print("BASE_DIR:", BASE_DIR)
            print("DB PATH:", uri)
            print("UPLOAD DIR EXISTS:", os.path.exists(os.path.join(BASE_DIR, "uploads")))
            
            if "sqlite" in dialect:
                diag_msg = f"DATABASE DIAGNOSTICS WARNING: Remote database host unavailable. Falling back to local SQLite at {db_name}. SSL State: {ssl_state}"
            else:
                diag_msg = f"DATABASE DIAGNOSTICS: Connected to Aiven MySQL successfully! Dialect: {dialect} | Host: {host} | Database: {db_name} | SSL State: {ssl_state}"
            
            app.logger.warning(diag_msg)
            print(diag_msg)

            boot_msg = f"BACKEND BOOT SUCCESS: AshaKiran running in {flask_env.upper()} mode | Debug: {debug_mode} | CORS: {_RAW_ORIGINS}"
            app.logger.warning(boot_msg)
            print(boot_msg)
            
        except Exception as err:
            err_msg = f"DATABASE DIAGNOSTICS CRITICAL ERROR: Database handshake failed! Details: {err}"
            app.logger.error(err_msg)
            print(err_msg)

    # ── CORS (manual — flask-cors callable support not available) ────────────
    @app.after_request
    def add_cors_headers(response):
        origin = request.headers.get("Origin", "")
        # Always allow CORS for health endpoint to prevent false offline status
        if request.path == "/health" or request.path == "/":
            response.headers["Access-Control-Allow-Origin"]      = origin if origin else "*"
            response.headers["Access-Control-Allow-Headers"]     = "Content-Type, Authorization"
            response.headers["Access-Control-Allow-Methods"]     = "GET, OPTIONS"
            return response
        if _is_allowed_origin(origin):
            response.headers["Access-Control-Allow-Origin"]      = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Access-Control-Allow-Headers"]     = "Content-Type, Authorization"
            response.headers["Access-Control-Allow-Methods"]     = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        return response

    @app.before_request
    def handle_options():
        if request.method == "OPTIONS":
            origin = request.headers.get("Origin", "")
            if request.path == "/health" or request.path == "/":
                resp = make_response("", 204)
                resp.headers["Access-Control-Allow-Origin"]      = origin if origin else "*"
                resp.headers["Access-Control-Allow-Headers"]     = "Content-Type, Authorization"
                resp.headers["Access-Control-Allow-Methods"]     = "GET, OPTIONS"
                resp.headers["Access-Control-Allow-Max-Age"]     = "86400"
                return resp
            if _is_allowed_origin(origin):
                resp = make_response("", 204)
                resp.headers["Access-Control-Allow-Origin"]      = origin
                resp.headers["Access-Control-Allow-Credentials"] = "true"
                resp.headers["Access-Control-Allow-Headers"]     = "Content-Type, Authorization"
                resp.headers["Access-Control-Allow-Methods"]     = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
                resp.headers["Access-Control-Allow-Max-Age"]     = "86400"
                return resp

    @app.after_request
    def add_security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data: http: https: blob:; "
            "connect-src 'self' http: https: ws: wss:;"
        )
        return response

    # ── Prometheus metrics scraping route ──
    @app.route("/metrics")
    def metrics_scrape():
        return generate_latest(), 200, {'Content-Type': CONTENT_TYPE_LATEST}

    # ── Request Timing & Structured JSON stdout logging middleware ──
    @app.before_request
    def start_timer():
        request.start_time = time.time()

    @app.after_request
    def log_request_response(response):
        duration = 0.0
        if hasattr(request, 'start_time'):
            duration = time.time() - request.start_time
            REQUEST_LATENCY.labels(request.method, request.path).observe(duration)
        REQUEST_COUNT.labels(request.method, request.path, response.status_code).observe(1)

        # Output JSON structured log to stdout (exclude verbose metrics/health noise)
        if request.path not in ["/metrics", "/health", "/"] and not request.path.startswith("/api/uploads"):
            log_data = {
                "event": "request_completed",
                "ip": request.remote_addr,
                "method": request.method,
                "path": request.path,
                "status": response.status_code,
                "duration_sec": round(duration, 4),
                "user_agent": request.headers.get("User-Agent", "unknown")
            }
            print(json.dumps(log_data), file=sys.stdout, flush=True)

        return response

    # ── Health endpoint ──────────────────────────────────────────────────────
    @app.route("/")
    @app.route("/health")
    def health_check():
        health_status = {
            "status": "healthy",
            "database": "healthy",
            "timestamp": datetime.utcnow().isoformat()
        }
        status_code = 200
        try:
            # Active database health query
            db.session.execute(db.text("SELECT 1"))
        except Exception as err:
            health_status["status"] = "unhealthy"
            health_status["database"] = f"unreachable: {str(err)}"
            status_code = 500
            app.logger.error(f"HEALTH CHECK FAILURE: Database connection failed: {err}")

        return jsonify(health_status), status_code

    # ── Global error handlers ────────────────────────────────────────────────
    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "Not found", "path": request.path}), 404

    @app.errorhandler(405)
    def method_not_allowed(e):
        return jsonify({"error": "Method not allowed"}), 405

    @app.errorhandler(500)
    def internal_error(e):
        log.exception("Unhandled 500: %s", e)
        try:
            db.session.rollback()
        except Exception:
            pass
        return jsonify({"error": "Internal server error"}), 500

    # ── Blueprints ────────────────────────────────────────────────────────────
    from app.routes.auth import auth_bp
    from app.routes.patients import patients_bp
    from app.routes.sync import sync_bp
    from app.routes.programmes import programmes_bp
    from app.routes.reports import reports_bp
    from app.routes.delete_patient import delete_patient_bp

    app.register_blueprint(auth_bp, url_prefix="/api")
    app.register_blueprint(patients_bp, url_prefix="/api")
    app.register_blueprint(sync_bp, url_prefix="/api")
    app.register_blueprint(programmes_bp, url_prefix="/api")
    app.register_blueprint(reports_bp, url_prefix="/api")
    app.register_blueprint(delete_patient_bp, url_prefix="/api")

    # ── Uploads ───────────────────────────────────────────────────────────────
    from flask import send_from_directory

    @app.route("/api/uploads/<string:filename>")
    def uploaded_file(filename):
        # Using <string:> (not <path:>) prevents directory traversal attacks.
        # string: does not allow slashes in the filename.
        return send_from_directory(os.path.join(app.root_path, "..", "uploads"), filename)

    return app

import os
import logging
from logging.handlers import RotatingFileHandler
from flask import Flask, jsonify, request, make_response
from flask_sqlalchemy import SQLAlchemy
from config import Config

db = SQLAlchemy()

# ── Logging ───────────────────────────────────────────────────────────────────
_log_dir = os.path.join(os.path.dirname(__file__), '..', 'logs')
os.makedirs(_log_dir, exist_ok=True)
_log_path = os.path.join(_log_dir, 'backend.log')

_handler = RotatingFileHandler(_log_path, maxBytes=5_000_000, backupCount=3)
_handler.setLevel(logging.WARNING)
_handler.setFormatter(logging.Formatter('%(asctime)s %(levelname)s %(name)s: %(message)s'))
logging.getLogger().addHandler(_handler)
log = logging.getLogger(__name__)

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
    
    if clean_origin in _ALLOWED_ORIGINS:
        return True
        
    # In development mode, also allow local developer ports
    if os.getenv("FLASK_ENV") != "production":
        if clean_origin.startswith("http://localhost:") or clean_origin.startswith("http://127.0.0.1:"):
            return True
            
    return False


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    # Security: limit request body size to 16MB (prevents disk-fill attacks on upload)
    app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16 MB

    db.init_app(app)

    # ── Database Diagnostics & Handshake ─────────────────────────────────────────
    with app.app_context():
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
            if _is_allowed_origin(origin):
                resp = make_response("", 204)
                resp.headers["Access-Control-Allow-Origin"]      = origin
                resp.headers["Access-Control-Allow-Credentials"] = "true"
                resp.headers["Access-Control-Allow-Headers"]     = "Content-Type, Authorization"
                resp.headers["Access-Control-Allow-Methods"]     = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
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

    # ── Health endpoint ──────────────────────────────────────────────────────
    @app.route("/")
    @app.route("/health")
    def health_check():
        return jsonify({
            "status": "healthy"
        }), 200

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

import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class Config:
    # Managed Database URI Resolution Logic
    _db_url = os.getenv("DATABASE_URL")
    _CA_PEM_PATH = os.path.join(os.path.abspath(os.path.dirname(__file__)), "ca.pem")

    if _db_url:
        # Standardize dialect mapping to mysql+pymysql for Railway compatibility
        if _db_url.startswith("mysql://"):
            _db_url = _db_url.replace("mysql://", "mysql+pymysql://", 1)
        elif _db_url.startswith("sqlite:///"):
            # Ensure SQLite path is absolute (Step 4)
            db_file = _db_url.replace("sqlite:///", "")
            if not os.path.isabs(db_file):
                _base_dir = os.path.abspath(os.path.dirname(__file__))
                os.makedirs(os.path.join(_base_dir, "instance"), exist_ok=True)
                _db_url = f"sqlite:///{os.path.join(_base_dir, 'instance', db_file)}"
    else:
        db_user = os.getenv("DB_USER")
        db_pass = os.getenv("DB_PASSWORD")
        db_host = os.getenv("DB_HOST")
        db_name = os.getenv("DB_NAME", "defaultdb")
        db_port = os.getenv("DB_PORT", "24154")
        
        # Determine if remote MySQL is fully configured
        if db_host and db_host != "localhost" and db_pass:
            _db_url = (
                f"mysql+pymysql://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}"
                f"?ssl_ca={_CA_PEM_PATH}"
            )
        else:
            # Clean development fallback to local SQLite
            _base_dir = os.path.abspath(os.path.dirname(__file__))
            _instance_dir = os.path.join(_base_dir, "instance")
            os.makedirs(_instance_dir, exist_ok=True)
            _db_url = f"sqlite:///{os.path.join(_instance_dir, 'ashakiran.db')}"

    SQLALCHEMY_DATABASE_URI = _db_url
    
    # Advanced Concurrency Connection Pooling Tuning (Optimised for Low-RAM Containers)
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_size": 5,
        "max_overflow": 5,
        "pool_recycle": 900,       # Recycle connection every 15 min to prevent managed DB drops
        "pool_timeout": 10,        # Safe timeout for low-RAM concurrency
        "pool_pre_ping": True,     # Auto-verify connection before query execution
        "connect_args": {
            "ssl": {
                "ca": _CA_PEM_PATH
            },
            "connect_timeout": 5
        }
    } if "mysql" in SQLALCHEMY_DATABASE_URI else {}
    
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    _secret = os.getenv("SECRET_KEY")
    if not _secret:
        if os.getenv("FLASK_ENV") == "production":
            raise RuntimeError("CRITICAL: SECRET_KEY environment variable is required in production!")
        _secret = "dev-secret-key"
    SECRET_KEY = _secret
    
    _jwt_secret = os.getenv("JWT_SECRET_KEY")
    if not _jwt_secret:
        _jwt_secret = _secret
    JWT_SECRET_KEY = _jwt_secret

    JWT_EXPIRY_HOURS = 24

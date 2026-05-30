import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class Config:
    # Managed Database URI Resolution Logic
    _db_url = os.getenv("DATABASE_URL")
    _CA_PEM_PATH = os.path.join(os.path.abspath(os.path.dirname(__file__)), "ca.pem")

    if not _db_url:
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
            _instance_dir = os.path.join(os.path.abspath(os.path.dirname(__file__)), "instance")
            os.makedirs(_instance_dir, exist_ok=True)
            _db_url = f"sqlite:///{os.path.join(_instance_dir, 'ashakiran.db')}"

    SQLALCHEMY_DATABASE_URI = _db_url
    
    # Advanced Concurrency Connection Pooling Tuning
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_size": 15,
        "max_overflow": 25,
        "pool_recycle": 900,       # Recycle connection every 15 min to prevent managed DB drops
        "pool_timeout": 5,         # Avoid thread blockage
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
    JWT_EXPIRY_HOURS = 24

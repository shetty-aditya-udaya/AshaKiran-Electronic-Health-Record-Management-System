import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class Config:
    # Aiven MySQL Connection details
    DB_USER = os.getenv("DB_USER", "avnadmin")
    DB_PASSWORD = os.getenv("DB_PASSWORD", "")
    DB_HOST = os.getenv("DB_HOST", "localhost")
    DB_PORT = os.getenv("DB_PORT", "24154")
    DB_NAME = os.getenv("DB_NAME", "defaultdb")
    
    # Path to ca.pem (in backend root)
    CA_PEM_PATH = os.path.join(os.path.abspath(os.path.dirname(__file__)), "ca.pem")

    # SQLAlchemy URI with SSL configuration
    _mysql_uri = (
        f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
        f"?ssl_ca={CA_PEM_PATH}"
    )
    
    # Fallback to local SQLite for development if MySQL connection is problematic
    # Ensure SQLALCHEMY_DATABASE_URI uses the MySQL URI unless DATABASE_URL is set
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", _mysql_uri)
    
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_size": 5,
        "max_overflow": 10,
        "pool_recycle": 1800,      # recycle connections every 30 min (Aiven drops idle after ~1h)
        "pool_timeout": 10,        # fail fast instead of hanging
        "pool_pre_ping": True,     # test connection before use
        "connect_args": {
            "ssl": {
                "ca": CA_PEM_PATH
            },
            "connect_timeout": 10, # TCP connect timeout
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

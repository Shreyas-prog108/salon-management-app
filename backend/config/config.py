import os
from datetime import timedelta

from dotenv import load_dotenv


load_dotenv()


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY")
    if not SECRET_KEY:
        raise ValueError("SECRET_KEY environment variable is required")

    SQLALCHEMY_TRACK_MODIFICATIONS = False

    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
    if not JWT_SECRET_KEY:
        raise ValueError("JWT_SECRET_KEY environment variable is required")

    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=1)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=30)
    JWT_ALGORITHM = "HS256"
    JSON_SORT_KEYS = False

    basedir = os.path.abspath(os.path.dirname(__file__))
    default_redis_url = (
        f"redis://{os.getenv('APP_REDIS_HOST', '127.0.0.1')}:"
        f"{os.getenv('APP_REDIS_PORT', '6380')}/"
        f"{os.getenv('APP_REDIS_DB', '0')}"
    )

    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL", "sqlite:///" + os.path.join(basedir, "..", "salon.db")
    )
    REDIS_URL = os.getenv("REDIS_URL", default_redis_url)
    CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", default_redis_url)
    CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", default_redis_url)
    SALON_TIMEZONE = os.getenv("SALON_TIMEZONE", "Asia/Kolkata")

    MAIL_SERVER = os.getenv("MAIL_SERVER", "smtp.gmail.com")
    MAIL_PORT = int(os.getenv("MAIL_PORT", 587))
    MAIL_USE_TLS = os.getenv("MAIL_USE_TLS", "True") == "True"
    MAIL_USERNAME = os.getenv("MAIL_USERNAME")
    MAIL_PASSWORD = os.getenv("MAIL_PASSWORD")
    MAIL_DEBUG = os.getenv("MAIL_DEBUG", "False") == "True"
    GOOGLE_CHAT_WEBHOOK_URL = os.getenv("GOOGLE_CHAT_WEBHOOK_URL")
    FAST2SMS_API_KEY = os.getenv("FAST2SMS_API_KEY")

    UPLOAD_FOLDER = os.path.join(basedir, "..", "uploads")
    EXPORT_FOLDER = os.path.join(basedir, "..", "exports")
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024


class DevelopmentConfig(Config):
    DEBUG = True
    TESTING = False


class ProductionConfig(Config):
    DEBUG = False
    TESTING = False


class TestingConfig(Config):
    DEBUG = True
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"


config = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "testing": TestingConfig,
    "default": DevelopmentConfig,
}

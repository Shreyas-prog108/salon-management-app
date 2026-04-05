import os

import redis
from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_mail import Mail
from flask_migrate import Migrate
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import inspect, text

from config.config import config


db = SQLAlchemy()
jwt = JWTManager()
migrate = Migrate()
mail = Mail()


def create_app(config_name="development"):
    app = Flask(__name__)
    app.config.from_object(config[config_name])

    db.init_app(app)
    jwt.init_app(app)
    migrate.init_app(app, db)
    mail.init_app(app)

    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
    cors_origins = [
        "http://localhost:3000", "http://127.0.0.1:3000",
        "http://localhost:5173", "http://127.0.0.1:5173",
        frontend_url,
    ]
    CORS(
        app,
        origins=list(set(cors_origins)),
        methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Content-Type", "Authorization"],
        credentials=True,
    )

    @app.after_request
    def set_security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response

    try:
        app.redis = redis.from_url(app.config["REDIS_URL"])
    except Exception as e:
        print(f"Redis connection error: {e}")
        app.redis = None

    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)
    os.makedirs(app.config["EXPORT_FOLDER"], exist_ok=True)
    os.makedirs("logs", exist_ok=True)

    from app.routes import admin, auth, booking, stylist

    app.register_blueprint(auth.bp)
    app.register_blueprint(admin.bp)
    app.register_blueprint(stylist.bp)
    app.register_blueprint(booking.bp)

    from flask import send_from_directory

    @app.route("/uploads/<path:filename>")
    def serve_upload(filename):
        return send_from_directory(app.config["UPLOAD_FOLDER"], filename)

    import models as db_models  # noqa: F401

    with app.app_context():
        db.create_all()
        ensure_appointment_columns()
        create_default_admin()
        create_default_services()
        create_default_operating_hours()

    return app


def create_default_admin():
    from models import User

    existing_user = User.query.filter_by(username="admin").first()
    if not existing_user:
        password = os.getenv("DEFAULT_ADMIN_PASSWORD", "")
        if not password:
            import secrets, string
            alphabet = string.ascii_letters + string.digits + string.punctuation
            password = "".join(secrets.choice(alphabet) for _ in range(16))
            print(f"[SETUP] No DEFAULT_ADMIN_PASSWORD set. Generated password: {password}")
            print("[SETUP] Set DEFAULT_ADMIN_PASSWORD in .env to use a fixed password.")
        admin = User(
            username=os.getenv("DEFAULT_ADMIN_USERNAME", "admin"),
            email=os.getenv("DEFAULT_ADMIN_EMAIL", "admin@salon.com"),
            full_name="Salon Owner",
            role="admin",
        )
        admin.set_password(password)
        db.session.add(admin)
        db.session.commit()
        print(f"[SETUP] Default admin created: username='{admin.username}'")
    else:
        pass  # Admin already exists, no output needed


def ensure_appointment_columns():
    inspector = inspect(db.engine)
    table_names = set(inspector.get_table_names())
    if "appointments" not in table_names:
        return

    columns = {col["name"] for col in inspector.get_columns("appointments")}
    statements = []
    if "customer_email" not in columns:
        statements.append("ALTER TABLE appointments ADD COLUMN customer_email VARCHAR(120)")
    if "morning_reminder_sent_at" not in columns:
        statements.append("ALTER TABLE appointments ADD COLUMN morning_reminder_sent_at TIMESTAMP")
    if "one_hour_reminder_sent_at" not in columns:
        statements.append("ALTER TABLE appointments ADD COLUMN one_hour_reminder_sent_at TIMESTAMP")

    for stmt in statements:
        db.session.execute(text(stmt))
    if statements:
        db.session.commit()


def create_default_services():
    from models import Service

    services = [
        {"name": "Haircut", "description": "Classic haircut and styling", "price": 300.0, "duration_minutes": 30},
        {"name": "Hair Coloring", "description": "Full hair coloring and highlights", "price": 1500.0, "duration_minutes": 90},
        {"name": "Hair Styling", "description": "Blow-dry, setting, and special occasion styling", "price": 600.0, "duration_minutes": 45},
        {"name": "Hair Treatment", "description": "Deep conditioning, keratin, and repair treatments", "price": 1200.0, "duration_minutes": 60},
        {"name": "Beard Trim", "description": "Beard shaping and grooming", "price": 200.0, "duration_minutes": 20},
        {"name": "Facial", "description": "Cleansing, scrubbing, and moisturizing facial", "price": 800.0, "duration_minutes": 60},
        {"name": "Manicure", "description": "Nail shaping, cuticle care, and polish", "price": 400.0, "duration_minutes": 30},
        {"name": "Pedicure", "description": "Foot care, nail shaping, and polish", "price": 500.0, "duration_minutes": 45},
        {"name": "Waxing", "description": "Full body or partial waxing services", "price": 600.0, "duration_minutes": 45},
        {"name": "Bridal Package", "description": "Complete bridal makeup and styling", "price": 5000.0, "duration_minutes": 180},
        {"name": "Head Massage", "description": "Relaxing scalp and head massage", "price": 350.0, "duration_minutes": 30},
        {"name": "Eyebrow Threading", "description": "Eyebrow shaping and threading", "price": 100.0, "duration_minutes": 15},
    ]

    for svc_data in services:
        svc = Service.query.filter_by(name=svc_data["name"]).first()
        if not svc:
            svc = Service(**svc_data)
            db.session.add(svc)

    db.session.commit()


def create_default_operating_hours():
    from datetime import time
    from models import SalonOperatingHours

    if SalonOperatingHours.query.count() == 0:
        defaults = [
            {"day_of_week": 0, "open_time": time(9, 0), "close_time": time(20, 0), "is_open": True},
            {"day_of_week": 1, "open_time": time(9, 0), "close_time": time(20, 0), "is_open": True},
            {"day_of_week": 2, "open_time": time(9, 0), "close_time": time(20, 0), "is_open": True},
            {"day_of_week": 3, "open_time": time(9, 0), "close_time": time(20, 0), "is_open": True},
            {"day_of_week": 4, "open_time": time(9, 0), "close_time": time(20, 0), "is_open": True},
            {"day_of_week": 5, "open_time": time(10, 0), "close_time": time(18, 0), "is_open": True},
            {"day_of_week": 6, "open_time": None, "close_time": None, "is_open": False},
        ]
        for d in defaults:
            db.session.add(SalonOperatingHours(**d))
        db.session.commit()

import os
from datetime import datetime, timedelta

import redis
from flask import Flask, current_app
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_mail import Mail
from flask_migrate import Migrate
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import inspect, text

from app.utils.security import is_token_revoked, validate_password_complexity
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

    @jwt.token_in_blocklist_loader
    def check_if_token_revoked(_jwt_header, jwt_payload):
        return is_token_revoked(jwt_payload.get("jti"))

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
        ensure_operating_hours_columns()
        ensure_appointment_slot_backfill()
        create_default_admin()
        create_default_services()
        create_default_operating_hours()
        ensure_weekly_availability_templates()

    return app


def create_default_admin():
    from models import User

    existing_user = User.query.filter_by(username="admin").first()
    if not existing_user:
        password = os.getenv("DEFAULT_ADMIN_PASSWORD", "").strip()
        if not password:
            print("[SETUP] DEFAULT_ADMIN_PASSWORD not set. Skipping default admin creation.")
            return
        complexity_error = validate_password_complexity(password)
        if complexity_error:
            raise ValueError(f"DEFAULT_ADMIN_PASSWORD is too weak. {complexity_error}")
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
    if "seat_id" not in columns:
        statements.append("ALTER TABLE appointments ADD COLUMN seat_id INTEGER")
    if "time_slot" not in columns:
        statements.append("ALTER TABLE appointments ADD COLUMN time_slot VARCHAR(5)")
    if "morning_reminder_sent_at" not in columns:
        statements.append("ALTER TABLE appointments ADD COLUMN morning_reminder_sent_at TIMESTAMP")
    if "one_hour_reminder_sent_at" not in columns:
        statements.append("ALTER TABLE appointments ADD COLUMN one_hour_reminder_sent_at TIMESTAMP")

    for stmt in statements:
        db.session.execute(text(stmt))
    if statements:
        db.session.commit()


def ensure_operating_hours_columns():
    inspector = inspect(db.engine)
    table_names = set(inspector.get_table_names())
    if "salon_operating_hours" not in table_names:
        return

    columns = {col["name"] for col in inspector.get_columns("salon_operating_hours")}
    default_seats = max(int(current_app.config.get("SALON_TOTAL_SEATS", 3) or 3), 1)
    statements = []
    if "total_seats" not in columns:
        statements.append(f"ALTER TABLE salon_operating_hours ADD COLUMN total_seats INTEGER DEFAULT {default_seats}")

    for stmt in statements:
        db.session.execute(text(stmt))
    if statements:
        db.session.commit()

    db.session.execute(
        text("UPDATE salon_operating_hours SET total_seats = :default_seats WHERE total_seats IS NULL"),
        {"default_seats": default_seats},
    )
    db.session.commit()


def ensure_appointment_slot_backfill():
    from models import Appointment, AppointmentSlot, SalonOperatingHours

    def normalized_slot_strings(start_time, duration_minutes):
        current = datetime.combine(datetime.today(), start_time).replace(second=0, microsecond=0)
        current = current.replace(minute=(current.minute // 30) * 30)
        total_blocks = max(int((max(duration_minutes, 30) + 29) // 30), 1)
        return [
            (current + timedelta(minutes=30 * offset)).strftime("%H:%M")
            for offset in range(total_blocks)
        ]

    missing_slots = (
        Appointment.query.outerjoin(AppointmentSlot, AppointmentSlot.appointment_id == Appointment.id)
        .filter(Appointment.status.in_(["Booked", "WalkIn", "Completed"]))
        .filter(AppointmentSlot.id.is_(None))
        .all()
    )
    if not missing_slots:
        return

    for appointment in missing_slots:
        operating_hours = SalonOperatingHours.query.filter_by(
            day_of_week=appointment.appointment_date.weekday()
        ).first()
        total_seats = max(
            int(
                (operating_hours.total_seats if operating_hours and operating_hours.total_seats else current_app.config.get("SALON_TOTAL_SEATS", 3))
                or 3
            ),
            1,
        )
        duration_minutes = 30
        if appointment.service and appointment.service.duration_minutes:
            duration_minutes = appointment.service.duration_minutes
        slot_strings = normalized_slot_strings(appointment.appointment_time, duration_minutes)
        appointment.time_slot = appointment.time_slot or slot_strings[0]
        occupied_seats = {
            seat_id
            for seat_id, in db.session.query(AppointmentSlot.seat_id)
            .filter(
                AppointmentSlot.appointment_date == appointment.appointment_date,
                AppointmentSlot.time_slot.in_(slot_strings),
            )
            .all()
        }
        if appointment.seat_id not in occupied_seats and appointment.seat_id:
            chosen_seat = appointment.seat_id
        else:
            chosen_seat = next((seat_id for seat_id in range(1, total_seats + 1) if seat_id not in occupied_seats), None)
        if not chosen_seat:
            continue
        appointment.seat_id = chosen_seat
        for slot_string in slot_strings:
            exists = AppointmentSlot.query.filter_by(
                appointment_id=appointment.id,
                appointment_date=appointment.appointment_date,
                time_slot=slot_string,
                seat_id=chosen_seat,
                stylist_id=appointment.stylist_id,
            ).first()
            if exists:
                continue
            db.session.add(
                AppointmentSlot(
                    appointment_id=appointment.id,
                    appointment_date=appointment.appointment_date,
                    time_slot=slot_string,
                    seat_id=chosen_seat,
                    stylist_id=appointment.stylist_id,
                )
            )
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
        default_seats = max(int(current_app.config.get("SALON_TOTAL_SEATS", 3) or 3), 1)
        defaults = [
            {"day_of_week": 0, "open_time": time(9, 0), "close_time": time(20, 0), "is_open": True, "total_seats": default_seats},
            {"day_of_week": 1, "open_time": time(9, 0), "close_time": time(20, 0), "is_open": True, "total_seats": default_seats},
            {"day_of_week": 2, "open_time": time(9, 0), "close_time": time(20, 0), "is_open": True, "total_seats": default_seats},
            {"day_of_week": 3, "open_time": time(9, 0), "close_time": time(20, 0), "is_open": True, "total_seats": default_seats},
            {"day_of_week": 4, "open_time": time(9, 0), "close_time": time(20, 0), "is_open": True, "total_seats": default_seats},
            {"day_of_week": 5, "open_time": time(10, 0), "close_time": time(18, 0), "is_open": True, "total_seats": default_seats},
            {"day_of_week": 6, "open_time": None, "close_time": None, "is_open": False, "total_seats": default_seats},
        ]
        for d in defaults:
            db.session.add(SalonOperatingHours(**d))
        db.session.commit()


def ensure_weekly_availability_templates():
    from app.utils.availability import seed_weekly_availability_from_operating_hours
    from models import StylistWeeklyAvailability, User

    stylists_without_templates = (
        User.query.filter_by(role="stylist")
        .outerjoin(StylistWeeklyAvailability, StylistWeeklyAvailability.stylist_id == User.id)
        .group_by(User.id)
        .having(db.func.count(StylistWeeklyAvailability.id) == 0)
        .all()
    )
    if not stylists_without_templates:
        return

    for stylist in stylists_without_templates:
        db.session.add_all(seed_weekly_availability_from_operating_hours(stylist.id))
    db.session.commit()

import os
import uuid
from datetime import date, timedelta

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy import case, func, or_
from werkzeug.utils import secure_filename

from app import db
from app.utils.decorators import role_required
from app.utils.helpers import clear_cache_pattern, delete_cache, get_cache, set_cache
from models import Appointment, SalonOperatingHours, Service, ServiceRecord, User


bp = Blueprint("admin", __name__, url_prefix="/api/admin")


def _parse_int_field(value, field_name, allow_null=True):
    if value is None or value == "":
        return (None, None) if allow_null else (None, f"{field_name} is required")
    try:
        return int(value), None
    except (TypeError, ValueError):
        return None, f"{field_name} must be an integer"


def _parse_float_field(value, field_name, allow_null=True):
    if value is None or value == "":
        return (None, None) if allow_null else (None, f"{field_name} is required")
    try:
        return float(value), None
    except (TypeError, ValueError):
        return None, f"{field_name} must be a number"


@bp.route("/dashboard", methods=["GET"])
@jwt_required()
@role_required("admin")
def dashboard():
    """Return admin dashboard summary metrics."""
    cache_key = "admin:dashboard"
    cached_data = get_cache(cache_key)
    if cached_data:
        return jsonify(cached_data), 200

    today = date.today()
    total_stylists = User.query.filter_by(role="stylist", is_active=True, is_blacklisted=False).count()
    total_appointments = Appointment.query.count()
    today_appointments = Appointment.query.filter(
        Appointment.appointment_date == today,
        Appointment.status.in_(["Booked", "WalkIn"]),
    ).count()
    booked_appointments = Appointment.query.filter_by(status="Booked").count()
    walkin_appointments = Appointment.query.filter_by(status="WalkIn").count()
    completed_appointments = Appointment.query.filter_by(status="Completed").count()
    cancelled_appointments = Appointment.query.filter_by(status="Cancelled").count()

    total_revenue = db.session.query(func.sum(ServiceRecord.price_charged)).scalar() or 0.0

    # Stylist utilization: completed appointments per stylist this month
    month_start = today.replace(day=1)
    stylist_stats = (
        db.session.query(
            Appointment.stylist_id,
            func.count(Appointment.id).label("count"),
        )
        .filter(
            Appointment.appointment_date >= month_start,
            Appointment.status == "Completed",
        )
        .group_by(Appointment.stylist_id)
        .all()
    )
    stylist_utilization = [{"stylist_id": s.stylist_id, "completed": s.count} for s in stylist_stats]

    data = {
        "total_stylists": total_stylists,
        "total_appointments": total_appointments,
        "today_appointments": today_appointments,
        "booked_appointments": booked_appointments,
        "walkin_appointments": walkin_appointments,
        "completed_appointments": completed_appointments,
        "cancelled_appointments": cancelled_appointments,
        "total_revenue": round(total_revenue, 2),
        "stylist_utilization": stylist_utilization,
    }
    set_cache(cache_key, data, expire=60)
    return jsonify(data), 200


@bp.route("/analytics", methods=["GET"])
@jwt_required()
@role_required("admin")
def analytics():
    """Return detailed sales analytics."""
    today = date.today()
    week_start = today - timedelta(days=today.weekday())   # Monday
    month_start = today.replace(day=1)

    def appt_count(start=None, end=None, statuses=None, walkin=None):
        q = Appointment.query
        if start:
            q = q.filter(Appointment.appointment_date >= start)
        if end:
            q = q.filter(Appointment.appointment_date <= end)
        if statuses:
            q = q.filter(Appointment.status.in_(statuses))
        if walkin is not None:
            q = q.filter(Appointment.is_walkin == walkin)
        return q.count()

    def revenue(start=None, end=None):
        q = db.session.query(func.sum(ServiceRecord.price_charged)).join(
            Appointment, ServiceRecord.appointment_id == Appointment.id
        )
        if start:
            q = q.filter(Appointment.appointment_date >= start)
        if end:
            q = q.filter(Appointment.appointment_date <= end)
        return round(q.scalar() or 0.0, 2)

    all_statuses = ["Booked", "WalkIn", "Completed", "Cancelled"]
    done = ["Completed"]

    # ── Period summaries ──────────────────────────────────────────
    periods = {}
    for key, start, end in [
        ("today",  today,       today),
        ("week",   week_start,  today),
        ("month",  month_start, today),
        ("all",    None,        None),
    ]:
        periods[key] = {
            "appointments": appt_count(start, end, all_statuses),
            "completed":    appt_count(start, end, done),
            "walkins":      appt_count(start, end, all_statuses, walkin=True),
            "bookings":     appt_count(start, end, all_statuses, walkin=False),
            "revenue":      revenue(start, end),
        }

    # Determine which period's date range to use for breakdowns
    period_param = request.args.get("period", "all")
    period_ranges = {
        "today": (today, today),
        "week":  (week_start, today),
        "month": (month_start, today),
        "all":   (None, None),
    }
    breakdown_start, breakdown_end = period_ranges.get(period_param, (None, None))

    def _apply_period(q):
        if breakdown_start:
            q = q.filter(Appointment.appointment_date >= breakdown_start)
        if breakdown_end:
            q = q.filter(Appointment.appointment_date <= breakdown_end)
        return q

    # ── Stylist-wise ──────────────────────────────────────────────
    stylist_rows = (
        _apply_period(
            db.session.query(
                Appointment.stylist_id,
                func.count(Appointment.id).label("total"),
                func.sum(case((Appointment.status == "Completed", 1), else_=0)).label("completed"),
                func.sum(case((Appointment.is_walkin == True, 1), else_=0)).label("walkins"),
            )
        )
        .group_by(Appointment.stylist_id)
        .all()
    )
    rev_by_stylist = dict(
        _apply_period(
            db.session.query(Appointment.stylist_id, func.sum(ServiceRecord.price_charged))
            .join(ServiceRecord, ServiceRecord.appointment_id == Appointment.id)
        )
        .group_by(Appointment.stylist_id)
        .all()
    )
    stylist_map = {u.id: u.full_name for u in User.query.filter_by(role="stylist").all()}
    stylist_stats = [
        {
            "stylist_id": r.stylist_id,
            "name": stylist_map.get(r.stylist_id, f"#{r.stylist_id}"),
            "total": r.total,
            "completed": r.completed,
            "walkins": r.walkins,
            "revenue": round(rev_by_stylist.get(r.stylist_id) or 0.0, 2),
        }
        for r in stylist_rows
    ]
    stylist_stats.sort(key=lambda x: x["revenue"], reverse=True)

    # ── Service-wise ──────────────────────────────────────────────
    service_rows = (
        _apply_period(
            db.session.query(
                Appointment.service_id,
                func.count(Appointment.id).label("total"),
                func.sum(case((Appointment.status == "Completed", 1), else_=0)).label("completed"),
            )
            .filter(Appointment.service_id.isnot(None))
        )
        .group_by(Appointment.service_id)
        .all()
    )
    rev_by_service = dict(
        _apply_period(
            db.session.query(Appointment.service_id, func.sum(ServiceRecord.price_charged))
            .join(ServiceRecord, ServiceRecord.appointment_id == Appointment.id)
            .filter(Appointment.service_id.isnot(None))
        )
        .group_by(Appointment.service_id)
        .all()
    )
    service_map = {s.id: s.name for s in Service.query.all()}
    service_stats = [
        {
            "service_id": r.service_id,
            "name": service_map.get(r.service_id, f"#{r.service_id}"),
            "total": r.total,
            "completed": r.completed,
            "revenue": round(rev_by_service.get(r.service_id) or 0.0, 2),
        }
        for r in service_rows
    ]
    service_stats.sort(key=lambda x: x["revenue"], reverse=True)

    # ── Daily revenue — last 30 days ──────────────────────────────
    thirty_days_ago = today - timedelta(days=29)
    daily_rows = (
        db.session.query(
            Appointment.appointment_date,
            func.count(Appointment.id).label("count"),
            func.sum(ServiceRecord.price_charged).label("rev"),
        )
        .join(ServiceRecord, ServiceRecord.appointment_id == Appointment.id)
        .filter(Appointment.appointment_date >= thirty_days_ago)
        .group_by(Appointment.appointment_date)
        .order_by(Appointment.appointment_date)
        .all()
    )
    daily_rev_map = {str(r.appointment_date): {"count": r.count, "revenue": round(r.rev or 0, 2)} for r in daily_rows}
    daily_trend = []
    for i in range(30):
        d = str(thirty_days_ago + timedelta(days=i))
        entry = daily_rev_map.get(d, {"count": 0, "revenue": 0})
        daily_trend.append({"date": d, **entry})

    return jsonify({
        "periods": periods,
        "stylist_stats": stylist_stats,
        "service_stats": service_stats,
        "daily_trend": daily_trend,
    }), 200


@bp.route("/services", methods=["GET"])
@jwt_required()
@role_required("admin")
def get_services():
    """List all services."""
    services = Service.query.all()
    return jsonify([svc.to_dict() for svc in services]), 200


@bp.route("/services", methods=["POST"])
@jwt_required()
@role_required("admin")
def create_service():
    """Create a new service."""
    data = request.get_json()
    if not data.get("name"):
        return jsonify({"error": "Service name is required"}), 400
    if Service.query.filter_by(name=data["name"]).first():
        return jsonify({"error": "Service already exists"}), 400

    price, price_error = _parse_float_field(data.get("price"), "price")
    if price_error:
        return jsonify({"error": price_error}), 400
    duration, duration_error = _parse_int_field(data.get("duration_minutes"), "duration_minutes")
    if duration_error:
        return jsonify({"error": duration_error}), 400

    try:
        svc = Service(
            name=data["name"],
            description=data.get("description"),
            price=price or 0.0,
            duration_minutes=duration or 30,
        )
        db.session.add(svc)
        db.session.commit()
        clear_cache_pattern("services:*")
        return jsonify(svc.to_dict()), 201
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Failed to create service"}), 500


@bp.route("/services/<int:service_id>", methods=["PUT"])
@jwt_required()
@role_required("admin")
def update_service(service_id):
    """Update an existing service."""
    svc = Service.query.get(service_id)
    if not svc:
        return jsonify({"error": "Service not found"}), 404

    data = request.get_json()
    try:
        if data.get("name"):
            svc.name = data["name"]
        if "description" in data:
            svc.description = data["description"]
        if "price" in data:
            price, price_error = _parse_float_field(data["price"], "price")
            if price_error:
                return jsonify({"error": price_error}), 400
            svc.price = price
        if "duration_minutes" in data:
            duration, duration_error = _parse_int_field(data["duration_minutes"], "duration_minutes")
            if duration_error:
                return jsonify({"error": duration_error}), 400
            svc.duration_minutes = duration
        if "is_active" in data:
            svc.is_active = data["is_active"]
        db.session.commit()
        clear_cache_pattern("services:*")
        return jsonify(svc.to_dict()), 200
    except Exception:
        db.session.rollback()
        return jsonify({"error": "An error occurred. Please try again."}), 500


@bp.route("/stylists", methods=["GET"])
@jwt_required()
@role_required("admin")
def get_stylists():
    """List stylists with optional filters."""
    search = request.args.get("search", "").strip()[:100]
    service_id = request.args.get("service_id", type=int)
    query = User.query.filter_by(role="stylist")

    if search:
        query = query.filter(
            or_(
                User.full_name.ilike(f"%{search}%"),
                User.email.ilike(f"%{search}%"),
                User.username.ilike(f"%{search}%"),
            )
        )
    if service_id:
        query = query.filter_by(service_id=service_id)

    stylists = query.all()
    return jsonify([s.to_dict() for s in stylists]), 200


@bp.route("/stylists", methods=["POST"])
@jwt_required()
@role_required("admin")
def create_stylist():
    """Create a stylist account."""
    data = request.get_json()
    required_fields = ["username", "email", "password", "full_name"]
    for field in required_fields:
        if not data.get(field):
            return jsonify({"error": f"{field} is required"}), 400

    if User.query.filter_by(username=data["username"]).first():
        return jsonify({"error": "Username already exists"}), 400
    if User.query.filter_by(email=data["email"]).first():
        return jsonify({"error": "Email already exists"}), 400

    experience_years, experience_error = _parse_int_field(data.get("experience_years"), "experience_years")
    if experience_error:
        return jsonify({"error": experience_error}), 400

    # Resolve offered service_ids (array)
    service_ids = data.get("service_ids", [])
    if not isinstance(service_ids, list):
        return jsonify({"error": "service_ids must be a list"}), 400
    offered_services = []
    for sid in service_ids:
        svc = Service.query.get(sid)
        if not svc:
            return jsonify({"error": f"Service {sid} not found"}), 404
        offered_services.append(svc)

    try:
        stylist = User(
            username=data["username"],
            email=data["email"],
            full_name=data["full_name"],
            phone=data.get("phone"),
            role="stylist",
            specialty=data.get("specialty"),
            experience_years=experience_years,
            bio=data.get("bio"),
        )
        stylist.set_password(data["password"])
        stylist.offered_services = offered_services
        db.session.add(stylist)
        db.session.commit()
        clear_cache_pattern("stylists:*")
        delete_cache("admin:dashboard")
        return jsonify(stylist.to_dict()), 201
    except Exception:
        db.session.rollback()
        return jsonify({"error": "An error occurred. Please try again."}), 500


@bp.route("/stylists/<int:stylist_id>", methods=["GET"])
@jwt_required()
@role_required("admin")
def get_stylist(stylist_id):
    """Return a single stylist record."""
    stylist = User.query.filter_by(id=stylist_id, role="stylist").first()
    if not stylist:
        return jsonify({"error": "Stylist not found"}), 404
    return jsonify(stylist.to_dict()), 200


@bp.route("/stylists/<int:stylist_id>", methods=["PUT"])
@jwt_required()
@role_required("admin")
def update_stylist(stylist_id):
    """Update a stylist record."""
    stylist = User.query.filter_by(id=stylist_id, role="stylist").first()
    if not stylist:
        return jsonify({"error": "Stylist not found"}), 404

    data = request.get_json()
    try:
        if data.get("full_name"):
            stylist.full_name = data["full_name"]
        if data.get("email"):
            if data["email"] != stylist.email and User.query.filter(
                User.email == data["email"], User.id != stylist.id
            ).first():
                return jsonify({"error": "Email already exists"}), 400
            stylist.email = data["email"]
        if data.get("phone"):
            stylist.phone = data["phone"]
        if "specialty" in data:
            stylist.specialty = data["specialty"]
        if "bio" in data:
            stylist.bio = data["bio"]
        if "experience_years" in data:
            experience_years, experience_error = _parse_int_field(
                data["experience_years"], "experience_years"
            )
            if experience_error:
                return jsonify({"error": experience_error}), 400
            stylist.experience_years = experience_years
        if "service_ids" in data:
            service_ids = data["service_ids"]
            if not isinstance(service_ids, list):
                return jsonify({"error": "service_ids must be a list"}), 400
            offered_services = []
            for sid in service_ids:
                svc = Service.query.get(sid)
                if not svc:
                    return jsonify({"error": f"Service {sid} not found"}), 404
                offered_services.append(svc)
            stylist.offered_services = offered_services
        if data.get("new_password"):
            if len(data["new_password"]) < 6:
                return jsonify({"error": "Password must be at least 6 characters"}), 400
            stylist.set_password(data["new_password"])
        if "is_active" in data:
            stylist.is_active = data["is_active"]
        db.session.commit()
        clear_cache_pattern("stylists:*")
        delete_cache("admin:dashboard")
        return jsonify(stylist.to_dict()), 200
    except Exception:
        db.session.rollback()
        return jsonify({"error": "An error occurred. Please try again."}), 500


@bp.route("/stylists/<int:stylist_id>", methods=["DELETE"])
@jwt_required()
@role_required("admin")
def delete_stylist(stylist_id):
    """Deactivate a stylist."""
    stylist = User.query.filter_by(id=stylist_id, role="stylist").first()
    if not stylist:
        return jsonify({"error": "Stylist not found"}), 404
    try:
        stylist.is_blacklisted = True
        stylist.is_active = False
        db.session.commit()
        clear_cache_pattern("stylists:*")
        delete_cache("admin:dashboard")
        return jsonify({"message": "Stylist deactivated successfully"}), 200
    except Exception:
        db.session.rollback()
        return jsonify({"error": "An error occurred. Please try again."}), 500


_ALLOWED_PHOTO_EXTS = {"jpg", "jpeg", "png", "webp"}


@bp.route("/stylists/<int:stylist_id>/photo", methods=["POST"])
@jwt_required()
@role_required("admin")
def upload_stylist_photo(stylist_id):
    """Upload or replace a stylist's profile photo."""
    stylist = User.query.filter_by(id=stylist_id, role="stylist").first()
    if not stylist:
        return jsonify({"error": "Stylist not found"}), 404

    if "photo" not in request.files:
        return jsonify({"error": "No photo file provided"}), 400

    file = request.files["photo"]
    if not file or file.filename == "":
        return jsonify({"error": "No file selected"}), 400

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in _ALLOWED_PHOTO_EXTS:
        return jsonify({"error": "Only JPG, PNG and WEBP files are allowed"}), 400

    upload_folder = current_app.config["UPLOAD_FOLDER"]

    # Remove old photo file if it exists
    if stylist.photo_url:
        old_name = os.path.basename(stylist.photo_url)
        old_path = os.path.join(upload_folder, old_name)
        if os.path.abspath(old_path).startswith(os.path.abspath(upload_folder)):
            if os.path.exists(old_path):
                os.remove(old_path)

    filename = f"stylist_{stylist_id}_{uuid.uuid4().hex}.{ext}"
    file.save(os.path.join(upload_folder, filename))

    stylist.photo_url = f"/uploads/{filename}"
    db.session.commit()
    clear_cache_pattern("stylists:*")
    return jsonify({"photo_url": stylist.photo_url}), 200


@bp.route("/appointments", methods=["GET"])
@jwt_required()
@role_required("admin")
def get_appointments():
    """List appointments with admin filters."""
    status = request.args.get("status")
    stylist_id = request.args.get("stylist_id", type=int)
    query = Appointment.query
    if status:
        query = query.filter_by(status=status)
    if stylist_id:
        query = query.filter_by(stylist_id=stylist_id)
    appointments = query.order_by(
        Appointment.appointment_date.desc(), Appointment.appointment_time.desc()
    ).all()
    return (
        jsonify(
            [apt.to_dict(include_stylist=True, include_service_record=True) for apt in appointments]
        ),
        200,
    )


@bp.route("/appointments/<int:appointment_id>/cancel", methods=["POST"])
@jwt_required()
@role_required("admin")
def cancel_appointment(appointment_id):
    """Cancel an appointment as admin."""
    appointment = Appointment.query.get(appointment_id)
    if not appointment:
        return jsonify({"error": "Appointment not found"}), 404
    if appointment.status == "Completed":
        return jsonify({"error": "Cannot cancel completed appointment"}), 400
    try:
        appointment.status = "Cancelled"
        db.session.commit()
        clear_cache_pattern("appointments:*")
        delete_cache("admin:dashboard")
        return jsonify(appointment.to_dict()), 200
    except Exception:
        db.session.rollback()
        return jsonify({"error": "An error occurred. Please try again."}), 500


@bp.route("/operating-hours", methods=["GET"])
@jwt_required()
@role_required("admin")
def get_operating_hours():
    """Return the salon's operating hours for all 7 days."""
    hours = SalonOperatingHours.query.order_by(SalonOperatingHours.day_of_week).all()
    return jsonify([h.to_dict() for h in hours]), 200


@bp.route("/operating-hours", methods=["PUT"])
@jwt_required()
@role_required("admin")
def update_operating_hours():
    """Bulk update operating hours. Expects a list of day objects."""
    data = request.get_json()
    if not isinstance(data, list):
        return jsonify({"error": "Expected a list of day objects"}), 400

    from datetime import time as dt_time

    try:
        for item in data:
            day = item.get("day_of_week")
            if day is None or not isinstance(day, int) or not (0 <= day <= 6):
                return jsonify({"error": f"Invalid day_of_week: {day}"}), 400

            record = SalonOperatingHours.query.filter_by(day_of_week=day).first()
            if not record:
                record = SalonOperatingHours(day_of_week=day)
                db.session.add(record)

            record.is_open = bool(item.get("is_open", True))
            open_str = item.get("open_time")
            close_str = item.get("close_time")
            if open_str:
                parts = open_str.split(":")
                record.open_time = dt_time(int(parts[0]), int(parts[1]))
            else:
                record.open_time = None
            if close_str:
                parts = close_str.split(":")
                record.close_time = dt_time(int(parts[0]), int(parts[1]))
            else:
                record.close_time = None

        db.session.commit()
        hours = SalonOperatingHours.query.order_by(SalonOperatingHours.day_of_week).all()
        return jsonify([h.to_dict() for h in hours]), 200
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Failed to update operating hours"}), 500

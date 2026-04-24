import os
import uuid
from datetime import date, time
from urllib.parse import urlencode

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app import db
from app.routes.booking import (
    _combine_slot,
    _now_local_wall_clock,
    _today_local,
    reconcile_appointment_after_barber_availability_change,
)
from app.utils.availability import (
    build_weekly_availability_payload,
    seed_weekly_availability_from_operating_hours,
)
from app.utils.decorators import role_required
from app.utils.email import send_email
from app.utils.helpers import clear_cache_pattern
from app.utils.sms import send_sms
from models import Appointment, ServiceRecord, StylistAvailability, StylistWeeklyAvailability, User

_ALLOWED_PHOTO_EXTS = {"jpg", "jpeg", "png", "webp"}


bp = Blueprint("stylist", __name__, url_prefix="/api/stylist")


def _parse_weekly_availability_payload(data):
    if not isinstance(data, dict):
        return None, None, None, "Invalid payload"

    day_of_week = data.get("day_of_week")
    if day_of_week is None or not isinstance(day_of_week, int) or not (0 <= day_of_week <= 6):
        return None, None, None, "day_of_week must be an integer between 0 and 6"

    is_available = bool(data.get("is_available", True))
    if not is_available:
        return day_of_week, None, None, None

    start_time = data.get("start_time")
    end_time = data.get("end_time")
    if not start_time or not end_time:
        return None, None, None, "start_time and end_time are required when is_available is true"

    try:
        start = time.fromisoformat(start_time)
        end = time.fromisoformat(end_time)
    except ValueError:
        return None, None, None, "Invalid time format, use HH:MM"

    if end <= start:
        return None, None, None, "end_time must be after start_time"

    return day_of_week, start, end, None


def _booking_lookup_url(phone=None):
    base_url = (os.getenv("FRONTEND_URL") or "http://localhost:3000").rstrip("/")
    query = urlencode({"phone": phone}) if phone else ""
    return f"{base_url}/book{f'?{query}' if query else ''}"


def _notify_customer_about_appointment_change(change_details):
    booking_link = _booking_lookup_url(change_details.get("customer_phone"))
    service_name = change_details.get("service_name") or "General Service"
    customer_name = change_details.get("customer_name") or "Customer"
    old_stylist_name = change_details.get("old_stylist_name") or "your barber"
    old_date = change_details.get("old_date")
    old_time = change_details.get("old_time")

    if change_details.get("action") == "rescheduled":
        new_date = change_details.get("new_date")
        new_time = change_details.get("new_time")
        new_stylist_name = change_details.get("new_stylist_name") or old_stylist_name
        text_body = f"""
Dear {customer_name},

Your {service_name} appointment with {old_stylist_name} on {old_date} at {old_time} has been rescheduled.

New appointment:
Date: {new_date}
Time: {new_time}
Barber: {new_stylist_name}

If this new slot does not work for you, book a different slot here:
{booking_link}
""".strip()
        html_body = f"""
<html>
<body>
    <p>Dear {customer_name},</p>
    <p>Your <strong>{service_name}</strong> appointment with <strong>{old_stylist_name}</strong> on <strong>{old_date}</strong> at <strong>{old_time}</strong> has been rescheduled.</p>
    <ul>
        <li><strong>New date:</strong> {new_date}</li>
        <li><strong>New time:</strong> {new_time}</li>
        <li><strong>Barber:</strong> {new_stylist_name}</li>
    </ul>
    <p>If this new slot does not work for you, book a different slot here: <a href="{booking_link}">{booking_link}</a></p>
</body>
</html>
""".strip()
        sms_body = (
            f"Hi {customer_name}, your {service_name} appointment on {old_date} at {old_time} "
            f"was moved to {new_date} at {new_time} with {new_stylist_name}. Manage it here: {booking_link}"
        )
        subject = "Appointment Rescheduled - Baalbar"
    else:
        text_body = f"""
Dear {customer_name},

Your {service_name} appointment with {old_stylist_name} on {old_date} at {old_time} has been cancelled by the barber.

Please book a new slot here:
{booking_link}
""".strip()
        html_body = f"""
<html>
<body>
    <p>Dear {customer_name},</p>
    <p>Your <strong>{service_name}</strong> appointment with <strong>{old_stylist_name}</strong> on <strong>{old_date}</strong> at <strong>{old_time}</strong> has been cancelled by the barber.</p>
    <p>Please book a new slot here: <a href="{booking_link}">{booking_link}</a></p>
</body>
</html>
""".strip()
        sms_body = (
            f"Hi {customer_name}, your {service_name} appointment on {old_date} at {old_time} "
            f"was cancelled by the barber. Rebook here: {booking_link}"
        )
        subject = "Appointment Cancelled - Baalbar"

    if change_details.get("customer_email"):
        send_email(
            subject=subject,
            recipients=change_details["customer_email"],
            text_body=text_body,
            html_body=html_body,
        )
    if change_details.get("customer_phone"):
        send_sms(change_details["customer_phone"], sms_body)


def _reconcile_future_appointments_for_day(stylist_id, day_of_week):
    appointments = (
        Appointment.query.filter_by(stylist_id=stylist_id, status="Booked")
        .filter(Appointment.appointment_date >= _today_local())
        .order_by(Appointment.appointment_date.asc(), Appointment.appointment_time.asc())
        .all()
    )
    notifications = []
    now_local = _now_local_wall_clock()

    for appointment in appointments:
        if appointment.appointment_date.weekday() != day_of_week:
            continue
        if appointment.appointment_date == _today_local() and _combine_slot(
            appointment.appointment_date, appointment.appointment_time
        ) <= now_local:
            continue

        result = reconcile_appointment_after_barber_availability_change(appointment.id)
        if result.get("action") in {"rescheduled", "cancelled"}:
            notifications.append(result)

    for notification in notifications:
        _notify_customer_about_appointment_change(notification)

    return notifications


@bp.route("/appointments", methods=["GET"])
@jwt_required()
@role_required("stylist")
def get_my_appointments():
    """Return appointments assigned to the authenticated stylist."""
    stylist_id = int(get_jwt_identity())
    status = request.args.get("status")
    appt_date = request.args.get("date")

    query = Appointment.query.filter_by(stylist_id=stylist_id)
    if status:
        query = query.filter_by(status=status)
    if appt_date:
        try:
            query = query.filter_by(appointment_date=date.fromisoformat(appt_date))
        except ValueError:
            return jsonify({"error": "Invalid date format, use YYYY-MM-DD"}), 400

    appointments = query.order_by(
        Appointment.appointment_date.asc(), Appointment.appointment_time.asc()
    ).all()
    return jsonify([a.to_dict(include_service_record=True) for a in appointments]), 200


@bp.route("/appointments/<int:appointment_id>/status", methods=["PUT"])
@jwt_required()
@role_required("stylist")
def update_appointment_status(appointment_id):
    """Update the status of an appointment (Complete or Cancel)."""
    stylist_id = int(get_jwt_identity())
    appointment = Appointment.query.filter_by(id=appointment_id, stylist_id=stylist_id).first()
    if not appointment:
        return jsonify({"error": "Appointment not found"}), 404

    data = request.get_json()
    new_status = data.get("status")
    allowed = {"Completed", "Cancelled"}
    if new_status not in allowed:
        return jsonify({"error": f"status must be one of: {', '.join(allowed)}"}), 400
    if appointment.status == "Completed":
        return jsonify({"error": "Appointment is already completed"}), 400
    if appointment.status == "Cancelled":
        return jsonify({"error": "Appointment is already cancelled"}), 400

    previous_details = {
        "action": "cancelled",
        "customer_name": appointment.customer_name,
        "customer_phone": appointment.customer_phone,
        "customer_email": appointment.customer_email,
        "service_name": appointment.service.name if appointment.service else "General Service",
        "old_date": appointment.appointment_date.isoformat() if appointment.appointment_date else None,
        "old_time": appointment.appointment_time.strftime("%H:%M") if appointment.appointment_time else None,
        "old_stylist_name": appointment.stylist.full_name if appointment.stylist else "Your barber",
    }

    try:
        appointment.status = new_status
        if new_status == "Cancelled":
            appointment.slot_blocks.clear()
        db.session.commit()
        clear_cache_pattern("appointments:*")
        clear_cache_pattern("admin:dashboard:*")
        if new_status == "Cancelled":
            _notify_customer_about_appointment_change(previous_details)
        return jsonify(appointment.to_dict()), 200
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Failed to update status"}), 500


@bp.route("/appointments/<int:appointment_id>/service-record", methods=["POST"])
@jwt_required()
@role_required("stylist")
def add_service_record(appointment_id):
    """Add a service record to a completed appointment."""
    stylist_id = int(get_jwt_identity())
    appointment = Appointment.query.filter_by(id=appointment_id, stylist_id=stylist_id).first()
    if not appointment:
        return jsonify({"error": "Appointment not found"}), 404
    if appointment.status != "Completed":
        return jsonify({"error": "Service record can only be added to completed appointments"}), 400
    if appointment.service_record:
        return jsonify({"error": "Service record already exists"}), 400

    data = request.get_json()
    if not data.get("service_performed"):
        return jsonify({"error": "service_performed is required"}), 400

    price_charged = data.get("price_charged")
    if price_charged is not None:
        try:
            price_charged = float(price_charged)
        except (TypeError, ValueError):
            return jsonify({"error": "price_charged must be a number"}), 400

    try:
        record = ServiceRecord(
            appointment_id=appointment_id,
            service_performed=data["service_performed"],
            notes=data.get("notes"),
            price_charged=price_charged,
        )
        db.session.add(record)
        db.session.commit()
        return jsonify(record.to_dict()), 201
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Failed to add service record"}), 500


@bp.route("/availability", methods=["GET"])
@jwt_required()
@role_required("stylist")
def get_availability():
    """Return the authenticated stylist's availability slots."""
    stylist_id = int(get_jwt_identity())
    date_str = request.args.get("date")
    query = StylistAvailability.query.filter_by(stylist_id=stylist_id)
    if date_str:
        try:
            query = query.filter_by(date=date.fromisoformat(date_str))
        except ValueError:
            return jsonify({"error": "Invalid date format, use YYYY-MM-DD"}), 400
    slots = query.order_by(StylistAvailability.date.asc(), StylistAvailability.start_time.asc()).all()
    return jsonify([s.to_dict() for s in slots]), 200


@bp.route("/availability", methods=["POST"])
@jwt_required()
@role_required("stylist")
def set_availability():
    """Add an availability slot."""
    stylist_id = int(get_jwt_identity())
    data = request.get_json()
    required = ["date", "start_time", "end_time"]
    for field in required:
        if not data.get(field):
            return jsonify({"error": f"{field} is required"}), 400

    try:
        slot_date = date.fromisoformat(data["date"])
    except ValueError:
        return jsonify({"error": "Invalid date format, use YYYY-MM-DD"}), 400
    try:
        start = time.fromisoformat(data["start_time"])
        end = time.fromisoformat(data["end_time"])
    except ValueError:
        return jsonify({"error": "Invalid time format, use HH:MM"}), 400

    if end <= start:
        return jsonify({"error": "end_time must be after start_time"}), 400

    try:
        slot = StylistAvailability(
            stylist_id=stylist_id,
            date=slot_date,
            start_time=start,
            end_time=end,
            is_available=True,
        )
        db.session.add(slot)
        db.session.commit()
        return jsonify(slot.to_dict()), 201
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Failed to add availability slot"}), 500


@bp.route("/availability/<int:slot_id>", methods=["DELETE"])
@jwt_required()
@role_required("stylist")
def delete_availability(slot_id):
    """Remove an availability slot."""
    stylist_id = int(get_jwt_identity())
    slot = StylistAvailability.query.filter_by(id=slot_id, stylist_id=stylist_id).first()
    if not slot:
        return jsonify({"error": "Availability slot not found"}), 404
    try:
        db.session.delete(slot)
        db.session.commit()
        return jsonify({"message": "Availability slot deleted"}), 200
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Failed to delete slot"}), 500


@bp.route("/weekly-availability", methods=["GET"])
@jwt_required()
@role_required("stylist")
def get_weekly_availability():
    stylist_id = int(get_jwt_identity())
    existing = StylistWeeklyAvailability.query.filter_by(stylist_id=stylist_id).count()
    if existing == 0:
        db.session.add_all(seed_weekly_availability_from_operating_hours(stylist_id))
        db.session.commit()
    return jsonify(build_weekly_availability_payload(stylist_id)), 200


@bp.route("/weekly-availability", methods=["POST"])
@jwt_required()
@role_required("stylist")
def create_weekly_availability():
    stylist_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}

    day_of_week, start, end, error = _parse_weekly_availability_payload(data)
    if error:
        return jsonify({"error": error}), 400

    existing = StylistWeeklyAvailability.query.filter_by(
        stylist_id=stylist_id,
        day_of_week=day_of_week,
    ).first()
    if existing:
        return jsonify({"error": "Weekly availability already exists for this day"}), 409

    try:
        row = StylistWeeklyAvailability(
            stylist_id=stylist_id,
            day_of_week=day_of_week,
            start_time=start,
            end_time=end,
            is_available=bool(data.get("is_available", True)),
        )
        db.session.add(row)
        db.session.commit()
        notifications = _reconcile_future_appointments_for_day(stylist_id, day_of_week)
        clear_cache_pattern("appointments:*")
        clear_cache_pattern("admin:dashboard:*")
        return jsonify({"availability": row.to_dict(), "updated_appointments": notifications}), 201
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Failed to create weekly availability"}), 500


@bp.route("/weekly-availability/<int:availability_id>", methods=["PUT"])
@jwt_required()
@role_required("stylist")
def update_weekly_availability(availability_id):
    stylist_id = int(get_jwt_identity())
    row = StylistWeeklyAvailability.query.filter_by(id=availability_id, stylist_id=stylist_id).first()
    if not row:
        return jsonify({"error": "Weekly availability not found"}), 404

    data = request.get_json(silent=True) or {}
    merged_data = {
        "day_of_week": row.day_of_week,
        "start_time": data.get("start_time", row.start_time.isoformat() if row.start_time else None),
        "end_time": data.get("end_time", row.end_time.isoformat() if row.end_time else None),
        "is_available": data.get("is_available", row.is_available),
    }
    day_of_week, start, end, error = _parse_weekly_availability_payload(merged_data)
    if error:
        return jsonify({"error": error}), 400

    try:
        row.day_of_week = day_of_week
        row.start_time = start
        row.end_time = end
        row.is_available = bool(merged_data.get("is_available", True))
        db.session.commit()
        notifications = _reconcile_future_appointments_for_day(stylist_id, row.day_of_week)
        clear_cache_pattern("appointments:*")
        clear_cache_pattern("admin:dashboard:*")
        return jsonify({"availability": row.to_dict(), "updated_appointments": notifications}), 200
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Failed to update weekly availability"}), 500


@bp.route("/weekly-availability/<int:availability_id>", methods=["DELETE"])
@jwt_required()
@role_required("stylist")
def delete_weekly_availability(availability_id):
    stylist_id = int(get_jwt_identity())
    row = StylistWeeklyAvailability.query.filter_by(id=availability_id, stylist_id=stylist_id).first()
    if not row:
        return jsonify({"error": "Weekly availability not found"}), 404

    day_of_week = row.day_of_week
    try:
        db.session.delete(row)
        db.session.commit()
        notifications = _reconcile_future_appointments_for_day(stylist_id, day_of_week)
        clear_cache_pattern("appointments:*")
        clear_cache_pattern("admin:dashboard:*")
        return jsonify({"message": "Weekly availability deleted", "updated_appointments": notifications}), 200
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Failed to delete weekly availability"}), 500


@bp.route("/profile", methods=["GET"])
@jwt_required()
@role_required("stylist")
def get_profile():
    """Return the stylist's own profile."""
    stylist_id = int(get_jwt_identity())
    stylist = User.query.get(stylist_id)
    if not stylist:
        return jsonify({"error": "User not found"}), 404
    return jsonify(stylist.to_dict()), 200


@bp.route("/profile", methods=["PUT"])
@jwt_required()
@role_required("stylist")
def update_profile():
    """Update the stylist's own profile."""
    stylist_id = int(get_jwt_identity())
    stylist = User.query.get(stylist_id)
    if not stylist:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json()
    try:
        if data.get("full_name"):
            stylist.full_name = data["full_name"]
        if data.get("phone"):
            stylist.phone = data["phone"]
        if "specialty" in data:
            stylist.specialty = data["specialty"]
        if "bio" in data:
            stylist.bio = data["bio"]
        db.session.commit()
        return jsonify(stylist.to_dict()), 200
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Failed to update profile"}), 500


@bp.route("/profile/photo", methods=["POST"])
@jwt_required()
@role_required("stylist")
def upload_profile_photo():
    """Upload or replace the authenticated stylist's profile photo."""
    stylist_id = int(get_jwt_identity())
    stylist = User.query.get(stylist_id)
    if not stylist:
        return jsonify({"error": "User not found"}), 404

    if "photo" not in request.files:
        return jsonify({"error": "No photo file provided"}), 400

    file = request.files["photo"]
    if not file or file.filename == "":
        return jsonify({"error": "No file selected"}), 400

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in _ALLOWED_PHOTO_EXTS:
        return jsonify({"error": "Only JPG, PNG and WEBP files are allowed"}), 400

    upload_folder = current_app.config["UPLOAD_FOLDER"]

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
    return jsonify({"photo_url": stylist.photo_url}), 200

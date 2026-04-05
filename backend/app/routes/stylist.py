import os
import uuid
from datetime import date, time

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app import db
from app.utils.decorators import role_required
from app.utils.helpers import clear_cache_pattern
from models import Appointment, ServiceRecord, StylistAvailability, User

_ALLOWED_PHOTO_EXTS = {"jpg", "jpeg", "png", "webp"}


bp = Blueprint("stylist", __name__, url_prefix="/api/stylist")


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

    try:
        appointment.status = new_status
        db.session.commit()
        clear_cache_pattern("appointments:*")
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

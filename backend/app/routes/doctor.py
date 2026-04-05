from datetime import date, datetime, timedelta

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app import db
from app.utils.decorators import role_required
from app.utils.helpers import clear_cache_pattern
from models import Appointment, DoctorAvailability, Treatment, User


bp = Blueprint("doctor", __name__, url_prefix="/api/doctor")


@bp.route("/dashboard", methods=["GET"])
@jwt_required()
@role_required("doctor")
def dashboard():
    """Return doctor dashboard data."""
    current_user_id = int(get_jwt_identity())
    today = date.today()
    week_end = today + timedelta(days=7)

    upcoming_appointments = Appointment.query.filter(
        Appointment.doctor_id == current_user_id,
        Appointment.appointment_date >= today,
        Appointment.appointment_date <= week_end,
        Appointment.status == "Booked",
    ).order_by(Appointment.appointment_date, Appointment.appointment_time).all()

    today_appointments = Appointment.query.filter(
        Appointment.doctor_id == current_user_id,
        Appointment.appointment_date == today,
        Appointment.status == "Booked",
    ).order_by(Appointment.appointment_time).all()

    total_patients = db.session.query(Appointment.patient_id).filter(
        Appointment.doctor_id == current_user_id
    ).distinct().count()
    completed_count = Appointment.query.filter_by(doctor_id=current_user_id, status="Completed").count()

    data = {
        "today_appointments": [apt.to_dict(include_patient=True) for apt in today_appointments],
        "upcoming_appointments": [apt.to_dict(include_patient=True) for apt in upcoming_appointments],
        "total_patients": total_patients,
        "completed_appointments": completed_count,
    }
    return jsonify(data), 200


@bp.route("/appointments", methods=["GET"])
@jwt_required()
@role_required("doctor")
def get_appointments():
    """List the doctor's appointments."""
    current_user_id = int(get_jwt_identity())
    status = request.args.get("status")
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")

    query = Appointment.query.filter_by(doctor_id=current_user_id)
    if status:
        query = query.filter_by(status=status)
    if start_date:
        query = query.filter(Appointment.appointment_date >= datetime.strptime(start_date, "%Y-%m-%d").date())
    if end_date:
        query = query.filter(Appointment.appointment_date <= datetime.strptime(end_date, "%Y-%m-%d").date())

    appointments = query.order_by(Appointment.appointment_date.desc(), Appointment.appointment_time.desc()).all()
    return jsonify([apt.to_dict(include_patient=True, include_treatment=True) for apt in appointments]), 200


@bp.route("/appointments/<int:appointment_id>", methods=["GET"])
@jwt_required()
@role_required("doctor")
def get_appointment(appointment_id):
    """Return one appointment for the doctor."""
    current_user_id = int(get_jwt_identity())
    appointment = Appointment.query.filter_by(id=appointment_id, doctor_id=current_user_id).first()
    if not appointment:
        return jsonify({"error": "Appointment not found"}), 404
    return jsonify(appointment.to_dict(include_patient=True, include_treatment=True)), 200


@bp.route("/appointments/<int:appointment_id>/complete", methods=["POST"])
@jwt_required()
@role_required("doctor")
def complete_appointment(appointment_id):
    """Complete an appointment and save treatment."""
    current_user_id = int(get_jwt_identity())
    appointment = Appointment.query.filter_by(id=appointment_id, doctor_id=current_user_id).first()
    if not appointment:
        return jsonify({"error": "Appointment not found"}), 404
    if appointment.status == "Completed":
        return jsonify({"error": "Appointment already completed"}), 400

    data = request.get_json()
    if not data.get("diagnosis"):
        return jsonify({"error": "Diagnosis is required"}), 400

    try:
        appointment.status = "Completed"
        treatment = Treatment.query.filter_by(appointment_id=appointment_id).first()
        if treatment:
            treatment.diagnosis = data["diagnosis"]
            treatment.prescription = data.get("prescription")
            treatment.treatment_notes = data.get("treatment_notes")
            if data.get("next_visit_date"):
                treatment.next_visit_date = datetime.strptime(data["next_visit_date"], "%Y-%m-%d").date()
        else:
            treatment = Treatment(
                appointment_id=appointment_id,
                diagnosis=data["diagnosis"],
                prescription=data.get("prescription"),
                treatment_notes=data.get("treatment_notes"),
                next_visit_date=(
                    datetime.strptime(data["next_visit_date"], "%Y-%m-%d").date()
                    if data.get("next_visit_date")
                    else None
                ),
            )
            db.session.add(treatment)

        db.session.commit()
        clear_cache_pattern(f"doctor:{current_user_id}:*")
        clear_cache_pattern(f"patient:{appointment.patient_id}:*")
        return jsonify(appointment.to_dict(include_patient=True, include_treatment=True)), 200
    except Exception:
        db.session.rollback()
        return jsonify({"error": "An error occurred. Please try again."}), 500


@bp.route("/appointments/<int:appointment_id>/cancel", methods=["POST"])
@jwt_required()
@role_required("doctor")
def cancel_appointment(appointment_id):
    """Cancel one appointment as doctor."""
    current_user_id = int(get_jwt_identity())
    appointment = Appointment.query.filter_by(id=appointment_id, doctor_id=current_user_id).first()
    if not appointment:
        return jsonify({"error": "Appointment not found"}), 404
    if appointment.status == "Completed":
        return jsonify({"error": "Cannot cancel completed appointment"}), 400

    try:
        appointment.status = "Cancelled"
        db.session.commit()
        clear_cache_pattern(f"doctor:{current_user_id}:*")
        clear_cache_pattern(f"patient:{appointment.patient_id}:*")
        return jsonify(appointment.to_dict()), 200
    except Exception:
        db.session.rollback()
        return jsonify({"error": "An error occurred. Please try again."}), 500


@bp.route("/patients", methods=["GET"])
@jwt_required()
@role_required("doctor")
def get_patients():
    """List patients seen by the doctor."""
    current_user_id = int(get_jwt_identity())
    patient_ids = db.session.query(Appointment.patient_id).filter(
        Appointment.doctor_id == current_user_id
    ).distinct().all()
    patient_ids = [pid[0] for pid in patient_ids]
    patients = User.query.filter(User.id.in_(patient_ids), User.role == "patient").all()
    return jsonify([patient.to_dict() for patient in patients]), 200


@bp.route("/patients/<int:patient_id>/history", methods=["GET"])
@jwt_required()
@role_required("doctor")
def get_patient_history(patient_id):
    """Return a patient's visit history for the doctor."""
    current_user_id = int(get_jwt_identity())
    appointments = Appointment.query.filter_by(
        patient_id=patient_id,
        doctor_id=current_user_id,
    ).order_by(Appointment.appointment_date.desc()).all()
    return jsonify([apt.to_dict(include_treatment=True) for apt in appointments]), 200


@bp.route("/treatments/<int:treatment_id>", methods=["PUT"])
@jwt_required()
@role_required("doctor")
def update_treatment(treatment_id):
    """Update an existing treatment record."""
    current_user_id = int(get_jwt_identity())
    treatment = Treatment.query.get(treatment_id)
    if not treatment:
        return jsonify({"error": "Treatment not found"}), 404
    if treatment.appointment.doctor_id != current_user_id:
        return jsonify({"error": "Unauthorized"}), 403

    data = request.get_json()
    try:
        if data.get("diagnosis"):
            treatment.diagnosis = data["diagnosis"]
        if "prescription" in data:
            treatment.prescription = data["prescription"]
        if "treatment_notes" in data:
            treatment.treatment_notes = data["treatment_notes"]
        if "next_visit_date" in data:
            if data["next_visit_date"]:
                treatment.next_visit_date = datetime.strptime(data["next_visit_date"], "%Y-%m-%d").date()
            else:
                treatment.next_visit_date = None

        db.session.commit()
        clear_cache_pattern(f"patient:{treatment.appointment.patient_id}:*")
        return jsonify(treatment.to_dict()), 200
    except Exception:
        db.session.rollback()
        return jsonify({"error": "An error occurred. Please try again."}), 500


@bp.route("/availability", methods=["GET"])
@jwt_required()
@role_required("doctor")
def get_availability():
    """List saved availability slots."""
    current_user_id = int(get_jwt_identity())
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")

    query = DoctorAvailability.query.filter_by(doctor_id=current_user_id)
    if start_date:
        query = query.filter(DoctorAvailability.date >= datetime.strptime(start_date, "%Y-%m-%d").date())
    if end_date:
        query = query.filter(DoctorAvailability.date <= datetime.strptime(end_date, "%Y-%m-%d").date())

    availability = query.order_by(DoctorAvailability.date, DoctorAvailability.start_time).all()
    return jsonify([avail.to_dict() for avail in availability]), 200


@bp.route("/availability", methods=["POST"])
@jwt_required()
@role_required("doctor")
def set_availability():
    """Create or update availability slots."""
    current_user_id = int(get_jwt_identity())
    data = request.get_json()
    if not data.get("availability") or not isinstance(data["availability"], list):
        return jsonify({"error": "Availability array is required"}), 400

    try:
        saved_slots = []
        for slot in data["availability"]:
            if not slot.get("date") or not slot.get("start_time") or not slot.get("end_time"):
                continue

            slot_date = datetime.strptime(slot["date"], "%Y-%m-%d").date()
            start_time = datetime.strptime(slot["start_time"], "%H:%M").time()
            end_time = datetime.strptime(slot["end_time"], "%H:%M").time()
            if end_time <= start_time:
                return jsonify({"error": f"End time must be after start time for {slot['date']}"}), 400

            existing_slots = DoctorAvailability.query.filter_by(
                doctor_id=current_user_id,
                date=slot_date,
            ).order_by(DoctorAvailability.id.asc()).all()

            if existing_slots:
                avail = existing_slots[0]
                avail.start_time = start_time
                avail.end_time = end_time
                avail.is_available = slot.get("is_available", True)
                for duplicate in existing_slots[1:]:
                    db.session.delete(duplicate)
            else:
                avail = DoctorAvailability(
                    doctor_id=current_user_id,
                    date=slot_date,
                    start_time=start_time,
                    end_time=end_time,
                    is_available=slot.get("is_available", True),
                )
                db.session.add(avail)

            saved_slots.append(avail)

        db.session.commit()
        clear_cache_pattern(f"doctor:{current_user_id}:*")
        clear_cache_pattern("doctors:*")
        return jsonify({"message": "Availability set successfully", "slots": [slot.to_dict() for slot in saved_slots]}), 201
    except Exception:
        db.session.rollback()
        return jsonify({"error": "An error occurred. Please try again."}), 500


@bp.route("/availability/<int:availability_id>", methods=["DELETE"])
@jwt_required()
@role_required("doctor")
def delete_availability(availability_id):
    """Delete one availability slot."""
    current_user_id = int(get_jwt_identity())
    avail = DoctorAvailability.query.filter_by(id=availability_id, doctor_id=current_user_id).first()
    if not avail:
        return jsonify({"error": "Availability slot not found"}), 404
    try:
        db.session.delete(avail)
        db.session.commit()
        clear_cache_pattern(f"doctor:{current_user_id}:*")
        return jsonify({"message": "Availability deleted successfully"}), 200
    except Exception:
        db.session.rollback()
        return jsonify({"error": "An error occurred. Please try again."}), 500


@bp.route("/profile", methods=["GET"])
@jwt_required()
@role_required("doctor")
def get_profile():
    """Return the doctor's profile."""
    current_user_id = int(get_jwt_identity())
    doctor = User.query.filter_by(id=current_user_id, role="doctor").first()
    if not doctor:
        return jsonify({"error": "Doctor not found"}), 404
    return jsonify(doctor.to_dict()), 200


@bp.route("/profile", methods=["PUT"])
@jwt_required()
@role_required("doctor")
def update_profile():
    """Update the doctor's profile."""
    current_user_id = int(get_jwt_identity())
    doctor = User.query.filter_by(id=current_user_id, role="doctor").first()
    if not doctor:
        return jsonify({"error": "Doctor not found"}), 404

    data = request.get_json()
    try:
        if data.get("phone"):
            doctor.phone = data["phone"]
        if data.get("qualification"):
            doctor.qualification = data["qualification"]
        if "experience_years" in data:
            doctor.experience_years = data["experience_years"]
        db.session.commit()
        clear_cache_pattern(f"doctor:{current_user_id}:*")
        return jsonify(doctor.to_dict()), 200
    except Exception:
        db.session.rollback()
        return jsonify({"error": "An error occurred. Please try again."}), 500

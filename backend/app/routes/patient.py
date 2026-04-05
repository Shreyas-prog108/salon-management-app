import os
from datetime import date, datetime, time, timedelta

from flask import Blueprint, jsonify, request, send_file
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy import and_, or_

from app import db
from app.utils.decorators import role_required
from app.utils.helpers import clear_cache_pattern, delete_cache, get_cache, set_cache
from models import Appointment, Department, DoctorAvailability, Treatment, User


bp = Blueprint("patient", __name__, url_prefix="/api/patient")


@bp.route("/dashboard", methods=["GET"])
@jwt_required()
@role_required("patient")
def dashboard():
    """Return patient dashboard data."""
    current_user_id = int(get_jwt_identity())
    today = date.today()

    upcoming_appointments = Appointment.query.filter(
        Appointment.patient_id == current_user_id,
        Appointment.appointment_date >= today,
        Appointment.status == "Booked",
    ).order_by(Appointment.appointment_date, Appointment.appointment_time).all()

    past_appointments = Appointment.query.filter(
        Appointment.patient_id == current_user_id,
        or_(
            Appointment.status == "Completed",
            and_(Appointment.appointment_date < today, Appointment.status == "Booked"),
        ),
    ).order_by(Appointment.appointment_date.desc()).limit(10).all()

    data = {
        "upcoming_appointments": [apt.to_dict(include_doctor=True) for apt in upcoming_appointments],
        "past_appointments": [apt.to_dict(include_doctor=True, include_treatment=True) for apt in past_appointments],
    }
    return jsonify(data), 200


@bp.route("/departments", methods=["GET"])
@jwt_required()
@role_required("patient")
def get_departments():
    """List active departments for patients."""
    cache_key = "departments:all"
    cached_data = get_cache(cache_key)
    if cached_data:
        return jsonify(cached_data), 200

    departments = Department.query.filter_by(is_active=True).all()
    data = []
    for dept in departments:
        dept_data = dept.to_dict()
        dept_data["doctors_count"] = User.query.filter_by(
            role="doctor", department_id=dept.id, is_active=True
        ).count()
        data.append(dept_data)

    set_cache(cache_key, data, expire=300)
    return jsonify(data), 200


@bp.route("/doctors", methods=["GET"])
@jwt_required()
@role_required("patient")
def get_doctors():
    """List available doctors for booking."""
    department_id = request.args.get("department_id", type=int)
    search = request.args.get("search", "")
    cache_key = f"doctors:list:{department_id}:{search}"
    cached_data = get_cache(cache_key)
    if cached_data:
        return jsonify(cached_data), 200

    query = User.query.filter_by(role="doctor", is_active=True, is_blacklisted=False)
    if department_id:
        query = query.filter_by(department_id=department_id)
    if search:
        query = query.filter(
            or_(User.full_name.ilike(f"%{search}%"), User.qualification.ilike(f"%{search}%"))
        )

    doctors = query.all()
    data = [doc.to_dict() for doc in doctors]
    set_cache(cache_key, data, expire=180)
    return jsonify(data), 200


@bp.route("/doctors/<int:doctor_id>", methods=["GET"])
@jwt_required()
@role_required("patient")
def get_doctor(doctor_id):
    """Return doctor details with availability."""
    cache_key = f"doctor:{doctor_id}:details"
    cached_data = get_cache(cache_key)
    if cached_data:
        return jsonify(cached_data), 200

    doctor = User.query.filter_by(id=doctor_id, role="doctor").first()
    if not doctor or not doctor.is_active or doctor.is_blacklisted:
        return jsonify({"error": "Doctor not found"}), 404

    today = date.today()
    week_end = today + timedelta(days=7)
    availability = DoctorAvailability.query.filter(
        DoctorAvailability.doctor_id == doctor_id,
        DoctorAvailability.date >= today,
        DoctorAvailability.date <= week_end,
        DoctorAvailability.is_available == True,
    ).order_by(DoctorAvailability.date, DoctorAvailability.start_time).all()

    data = doctor.to_dict()
    data["availability"] = [avail.to_dict() for avail in availability]
    set_cache(cache_key, data, expire=120)
    return jsonify(data), 200


@bp.route("/appointments", methods=["GET"])
@jwt_required()
@role_required("patient")
def get_appointments():
    """List the patient's appointments."""
    current_user_id = int(get_jwt_identity())
    status = request.args.get("status")
    query = Appointment.query.filter_by(patient_id=current_user_id)
    if status:
        query = query.filter_by(status=status)

    appointments = query.order_by(Appointment.appointment_date.desc(), Appointment.appointment_time.desc()).all()
    return jsonify([apt.to_dict(include_doctor=True, include_treatment=True) for apt in appointments]), 200


@bp.route("/appointments", methods=["POST"])
@jwt_required()
@role_required("patient")
def book_appointment():
    """Book a new appointment."""
    current_user_id = int(get_jwt_identity())
    data = request.get_json()
    required_fields = ["doctor_id", "appointment_date", "appointment_time"]
    for field in required_fields:
        if not data.get(field):
            return jsonify({"error": f"{field} is required"}), 400

    try:
        doctor = User.query.filter_by(id=data["doctor_id"], role="doctor").first()
        if not doctor or not doctor.is_active or doctor.is_blacklisted:
            return jsonify({"error": "Doctor not found or unavailable"}), 404

        appointment_date = datetime.strptime(data["appointment_date"], "%Y-%m-%d").date()
        appointment_time = datetime.strptime(data["appointment_time"], "%H:%M").time()

        if appointment_date < date.today():
            return jsonify({"error": "Cannot book appointment in the past"}), 400

        default_start_time = time(9, 0)
        default_end_time = time(17, 0)
        if appointment_time < default_start_time or appointment_time >= default_end_time:
            return jsonify({"error": "Appointments are only available between 9:00 AM and 5:00 PM"}), 400

        availability = DoctorAvailability.query.filter_by(
            doctor_id=data["doctor_id"],
            date=appointment_date,
            is_available=True,
        ).filter(
            and_(
                DoctorAvailability.start_time <= appointment_time,
                DoctorAvailability.end_time > appointment_time,
            )
        ).first()

        doctor_has_availability = DoctorAvailability.query.filter_by(
            doctor_id=data["doctor_id"],
            date=appointment_date,
        ).first()

        if doctor_has_availability and not availability:
            return jsonify({"error": "Doctor is not available at this time"}), 400

        appointment_datetime = datetime.combine(appointment_date, appointment_time)
        time_window_start = (appointment_datetime - timedelta(minutes=15)).time()
        time_window_end = (appointment_datetime + timedelta(minutes=15)).time()
        conflicting = Appointment.query.filter(
            Appointment.doctor_id == data["doctor_id"],
            Appointment.appointment_date == appointment_date,
            Appointment.status != "Cancelled",
            Appointment.appointment_time >= time_window_start,
            Appointment.appointment_time < time_window_end,
        ).first()

        if conflicting:
            return jsonify(
                {
                    "error": "This time slot is too close to another appointment. "
                    "Please choose a time at least 15 minutes apart."
                }
            ), 400

        appointment = Appointment(
            patient_id=current_user_id,
            doctor_id=data["doctor_id"],
            appointment_date=appointment_date,
            appointment_time=appointment_time,
            reason=data.get("reason"),
            status="Booked",
        )
        db.session.add(appointment)
        db.session.commit()

        clear_cache_pattern(f"patient:{current_user_id}:*")
        clear_cache_pattern(f"doctor:{data['doctor_id']}:*")
        delete_cache("admin:dashboard")

        try:
            from celery_tasks import send_appointment_booking_confirmation

            task = send_appointment_booking_confirmation.delay(appointment.id)
            print(f"Queued booking confirmation email task {task.id} for appointment {appointment.id}")
        except Exception as task_error:
            print(
                f"Failed to queue appointment confirmation email for appointment "
                f"{appointment.id}: {task_error}"
            )

        return jsonify(appointment.to_dict(include_doctor=True)), 201
    except ValueError:
        return jsonify({"error": "Invalid date or time format"}), 400
    except Exception:
        db.session.rollback()
        return jsonify({"error": "An error occurred. Please try again."}), 500


@bp.route("/appointments/<int:appointment_id>", methods=["GET"])
@jwt_required()
@role_required("patient")
def get_appointment(appointment_id):
    """Return one patient appointment."""
    current_user_id = int(get_jwt_identity())
    appointment = Appointment.query.filter_by(id=appointment_id, patient_id=current_user_id).first()
    if not appointment:
        return jsonify({"error": "Appointment not found"}), 404
    return jsonify(appointment.to_dict(include_doctor=True, include_treatment=True)), 200


@bp.route("/appointments/<int:appointment_id>/reschedule", methods=["PUT"])
@jwt_required()
@role_required("patient")
def reschedule_appointment(appointment_id):
    """Reschedule an existing appointment."""
    current_user_id = int(get_jwt_identity())
    appointment = Appointment.query.filter_by(id=appointment_id, patient_id=current_user_id).first()
    if not appointment:
        return jsonify({"error": "Appointment not found"}), 404
    if appointment.status != "Booked":
        return jsonify({"error": "Can only reschedule booked appointments"}), 400

    data = request.get_json()
    if not data.get("appointment_date") or not data.get("appointment_time"):
        return jsonify({"error": "New date and time required"}), 400

    try:
        new_date = datetime.strptime(data["appointment_date"], "%Y-%m-%d").date()
        new_time = datetime.strptime(data["appointment_time"], "%H:%M").time()
        if new_date < date.today():
            return jsonify({"error": "Cannot reschedule to a past date"}), 400

        default_start_time = time(9, 0)
        default_end_time = time(17, 0)
        if new_time < default_start_time or new_time >= default_end_time:
            return jsonify({"error": "Appointments are only available between 9:00 AM and 5:00 PM"}), 400

        availability = DoctorAvailability.query.filter_by(
            doctor_id=appointment.doctor_id,
            date=new_date,
            is_available=True,
        ).filter(
            and_(
                DoctorAvailability.start_time <= new_time,
                DoctorAvailability.end_time > new_time,
            )
        ).first()

        doctor_has_availability = DoctorAvailability.query.filter_by(
            doctor_id=appointment.doctor_id,
            date=new_date,
        ).first()

        if doctor_has_availability and not availability:
            return jsonify({"error": "Doctor is not available at this time"}), 400

        new_datetime = datetime.combine(new_date, new_time)
        time_window_start = (new_datetime - timedelta(minutes=15)).time()
        time_window_end = (new_datetime + timedelta(minutes=15)).time()
        conflicting = Appointment.query.filter(
            Appointment.doctor_id == appointment.doctor_id,
            Appointment.appointment_date == new_date,
            Appointment.id != appointment_id,
            Appointment.status != "Cancelled",
            Appointment.appointment_time >= time_window_start,
            Appointment.appointment_time < time_window_end,
        ).first()

        if conflicting:
            return jsonify(
                {
                    "error": "This time slot is too close to another appointment. "
                    "Please choose a time at least 15 minutes apart."
                }
            ), 400

        appointment.appointment_date = new_date
        appointment.appointment_time = new_time
        db.session.commit()
        clear_cache_pattern(f"patient:{current_user_id}:*")
        clear_cache_pattern(f"doctor:{appointment.doctor_id}:*")
        return jsonify(appointment.to_dict(include_doctor=True)), 200
    except ValueError:
        return jsonify({"error": "Invalid date or time format"}), 400
    except Exception:
        db.session.rollback()
        return jsonify({"error": "An error occurred. Please try again."}), 500


@bp.route("/appointments/<int:appointment_id>/cancel", methods=["POST"])
@jwt_required()
@role_required("patient")
def cancel_appointment(appointment_id):
    """Cancel one booked appointment."""
    current_user_id = int(get_jwt_identity())
    appointment = Appointment.query.filter_by(id=appointment_id, patient_id=current_user_id).first()
    if not appointment:
        return jsonify({"error": "Appointment not found"}), 404
    if appointment.status == "Completed":
        return jsonify({"error": "Cannot cancel completed appointment"}), 400
    if appointment.status == "Cancelled":
        return jsonify({"error": "Appointment already cancelled"}), 400

    try:
        appointment.status = "Cancelled"
        db.session.commit()
        clear_cache_pattern(f"patient:{current_user_id}:*")
        clear_cache_pattern(f"doctor:{appointment.doctor_id}:*")
        delete_cache("admin:dashboard")
        return jsonify(appointment.to_dict()), 200
    except Exception:
        db.session.rollback()
        return jsonify({"error": "An error occurred. Please try again."}), 500


@bp.route("/treatment-history", methods=["GET"])
@jwt_required()
@role_required("patient")
def get_treatment_history():
    """Return completed treatment history."""
    current_user_id = int(get_jwt_identity())
    appointments = Appointment.query.filter_by(
        patient_id=current_user_id,
        status="Completed",
    ).order_by(Appointment.appointment_date.desc()).all()

    history = []
    for apt in appointments:
        if apt.treatment:
            history.append({"appointment": apt.to_dict(include_doctor=True), "treatment": apt.treatment.to_dict()})
    return jsonify(history), 200


@bp.route("/profile", methods=["GET"])
@jwt_required()
@role_required("patient")
def get_profile():
    """Return the patient's profile."""
    current_user_id = int(get_jwt_identity())
    patient = User.query.filter_by(id=current_user_id, role="patient").first()
    if not patient:
        return jsonify({"error": "Patient not found"}), 404
    return jsonify(patient.to_dict()), 200


@bp.route("/profile", methods=["PUT"])
@jwt_required()
@role_required("patient")
def update_profile():
    """Update the patient's profile."""
    current_user_id = int(get_jwt_identity())
    patient = User.query.filter_by(id=current_user_id, role="patient").first()
    if not patient:
        return jsonify({"error": "Patient not found"}), 404

    data = request.get_json()
    try:
        if data.get("full_name"):
            patient.full_name = data["full_name"]
        if data.get("phone"):
            patient.phone = data["phone"]
        if data.get("email"):
            patient.email = data["email"]
        if "date_of_birth" in data and data["date_of_birth"]:
            patient.date_of_birth = datetime.strptime(data["date_of_birth"], "%Y-%m-%d").date()
        if data.get("gender"):
            patient.gender = data["gender"]
        if "address" in data:
            patient.address = data["address"]
        if data.get("blood_group"):
            patient.blood_group = data["blood_group"]
        if data.get("emergency_contact"):
            patient.emergency_contact = data["emergency_contact"]
        db.session.commit()
        clear_cache_pattern(f"patient:{current_user_id}:*")
        return jsonify(patient.to_dict()), 200
    except Exception:
        db.session.rollback()
        return jsonify({"error": "An error occurred. Please try again."}), 500


@bp.route("/export-treatment-history", methods=["POST"])
@jwt_required()
@role_required("patient")
def export_treatment_history():
    """Start the async treatment export job."""
    current_user_id = int(get_jwt_identity())
    try:
        from celery_tasks import export_patient_treatment_csv

        task = export_patient_treatment_csv.delay(current_user_id)
        return jsonify({"message": "Export job started", "task_id": task.id}), 202
    except Exception:
        return jsonify({"error": "An error occurred. Please try again."}), 500


@bp.route("/export-status/<task_id>", methods=["GET"])
@jwt_required()
@role_required("patient")
def check_export_status(task_id):
    """Return the current export job status."""
    try:
        from celery.result import AsyncResult
        from celery_app import celery_app

        task = AsyncResult(task_id, app=celery_app)
        if task.state == "PENDING":
            response = {"status": "pending"}
        elif task.state == "SUCCESS":
            response = {"status": "completed", "result": task.result}
        elif task.state == "FAILURE":
            response = {"status": "failed", "error": str(task.info)}
        else:
            response = {"status": task.state}
        return jsonify(response), 200
    except Exception:
        return jsonify({"error": "An error occurred. Please try again."}), 500


@bp.route("/download-export/<filename>", methods=["GET"])
@jwt_required()
@role_required("patient")
def download_export(filename):
    """Download a generated export file."""
    current_user_id = int(get_jwt_identity())
    if not filename.startswith(f"patient_{current_user_id}_"):
        return jsonify({"error": "Unauthorized"}), 403

    try:
        from flask import current_app

        file_path = os.path.join(current_app.config["EXPORT_FOLDER"], filename)
        if not os.path.exists(file_path):
            return jsonify({"error": "File not found"}), 404
        return send_file(file_path, as_attachment=True, download_name=filename)
    except Exception:
        return jsonify({"error": "An error occurred. Please try again."}), 500

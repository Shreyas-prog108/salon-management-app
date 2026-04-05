from datetime import date, datetime, time, timedelta

from flask import Blueprint, jsonify, request

from app import db
from app.utils.helpers import clear_cache_pattern, get_cache, set_cache
from models import Appointment, Service, StylistAvailability, User


bp = Blueprint("booking", __name__, url_prefix="/api/booking")


@bp.route("/services", methods=["GET"])
def get_services():
    """List all active services."""
    cache_key = "services:active"
    cached = get_cache(cache_key)
    if cached:
        return jsonify(cached), 200
    services = Service.query.filter_by(is_active=True).all()
    data = [svc.to_dict() for svc in services]
    set_cache(cache_key, data, expire=300)
    return jsonify(data), 200


@bp.route("/stylists", methods=["GET"])
def get_stylists():
    """List all active stylists."""
    query = User.query.filter_by(role="stylist", is_active=True, is_blacklisted=False)
    stylists = query.all()
    return jsonify([s.to_dict() for s in stylists]), 200


@bp.route("/stylists/<int:stylist_id>/availability", methods=["GET"])
def get_stylist_availability(stylist_id):
    """Return availability slots for a stylist on a given date."""
    stylist = User.query.filter_by(id=stylist_id, role="stylist", is_active=True).first()
    if not stylist:
        return jsonify({"error": "Stylist not found"}), 404

    date_str = request.args.get("date")
    if not date_str:
        return jsonify({"error": "date query parameter required (YYYY-MM-DD)"}), 400
    try:
        query_date = date.fromisoformat(date_str)
    except ValueError:
        return jsonify({"error": "Invalid date format, use YYYY-MM-DD"}), 400

    windows = StylistAvailability.query.filter_by(
        stylist_id=stylist_id, date=query_date, is_available=True
    ).all()

    # Determine the requested service duration (to check if new slot fits)
    service_id = request.args.get("service_id", type=int)
    new_duration_minutes = 30  # default
    if service_id:
        svc = Service.query.get(service_id)
        if svc and svc.duration_minutes:
            new_duration_minutes = svc.duration_minutes
    slot_interval = timedelta(minutes=30)          # always 30-min steps
    new_duration = timedelta(minutes=new_duration_minutes)

    # Build list of booked windows: (start, end) for each active appointment
    booked_appointments = Appointment.query.filter_by(
        stylist_id=stylist_id, appointment_date=query_date
    ).filter(Appointment.status.in_(["Booked", "WalkIn"])).all()

    booked_windows = []
    for a in booked_appointments:
        a_start = datetime.combine(query_date, a.appointment_time)
        a_svc_duration = 30
        if a.service and a.service.duration_minutes:
            a_svc_duration = a.service.duration_minutes
        a_end = a_start + timedelta(minutes=a_svc_duration)
        booked_windows.append((a_start, a_end))

    now_dt = datetime.now() if query_date == date.today() else None
    time_slots = []

    for window in windows:
        current = datetime.combine(query_date, window.start_time)
        win_end = datetime.combine(query_date, window.end_time)
        while current + new_duration <= win_end:
            slot_end = current + new_duration
            # Skip past slots for today
            if now_dt and current <= now_dt:
                current += slot_interval
                continue
            # Skip if this slot's full duration overlaps any booked window
            overlaps = any(
                current < b_end and slot_end > b_start
                for b_start, b_end in booked_windows
            )
            if not overlaps:
                time_slots.append(current.strftime("%H:%M"))
            current += slot_interval

    # Deduplicate while preserving order
    seen = set()
    unique_slots = []
    for s in time_slots:
        if s not in seen:
            seen.add(s)
            unique_slots.append(s)

    return jsonify(unique_slots), 200


@bp.route("/appointments", methods=["POST"])
def create_appointment():
    """Book an appointment."""
    data = request.get_json()
    required = [
        "stylist_id",
        "customer_name",
        "customer_phone",
        "appointment_date",
        "appointment_time",
    ]
    for field in required:
        if not data.get(field):
            return jsonify({"error": f"{field} is required"}), 400

    import re
    phone = str(data["customer_phone"]).strip()
    if not re.fullmatch(r"[0-9]{10}", phone):
        return jsonify({"error": "customer_phone must be a 10-digit number"}), 400

    customer_email = data.get("customer_email", "").strip() or None
    if customer_email and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", customer_email):
        return jsonify({"error": "Invalid email format"}), 400

    stylist = User.query.filter_by(id=data["stylist_id"], role="stylist", is_active=True, is_blacklisted=False).first()
    if not stylist:
        return jsonify({"error": "Stylist not found or unavailable"}), 404

    try:
        appt_date = date.fromisoformat(data["appointment_date"])
    except ValueError:
        return jsonify({"error": "Invalid appointment_date, use YYYY-MM-DD"}), 400

    try:
        appt_time = time.fromisoformat(data["appointment_time"])
    except ValueError:
        return jsonify({"error": "Invalid appointment_time, use HH:MM"}), 400

    if appt_date < date.today():
        return jsonify({"error": "Cannot book appointments in the past"}), 400

    conflict = Appointment.query.filter_by(
        stylist_id=data["stylist_id"],
        appointment_date=appt_date,
        appointment_time=appt_time,
    ).filter(Appointment.status.in_(["Booked", "WalkIn"])).first()
    if conflict:
        return jsonify({"error": "This time slot is already booked"}), 409

    service_id = data.get("service_id")
    if service_id and not Service.query.get(service_id):
        return jsonify({"error": "Service not found"}), 404

    try:
        appt = Appointment(
            stylist_id=data["stylist_id"],
            service_id=service_id,
            customer_name=data["customer_name"],
            customer_phone=data["customer_phone"],
            customer_email=data["customer_email"],
            appointment_date=appt_date,
            appointment_time=appt_time,
            reason=data.get("reason"),
            status="Booked",
            is_walkin=False,
        )
        db.session.add(appt)
        db.session.commit()

        try:
            from celery_tasks import send_appointment_booking_confirmation

            send_appointment_booking_confirmation.delay(appt.id)
        except Exception:
            pass

        clear_cache_pattern("appointments:*")
        return jsonify(appt.to_dict(include_stylist=True)), 201
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Failed to create appointment"}), 500


@bp.route("/walkin", methods=["POST"])
def create_walkin():
    """Register a walk-in appointment."""
    data = request.get_json()
    required = ["stylist_id", "customer_name", "customer_phone"]
    for field in required:
        if not data.get(field):
            return jsonify({"error": f"{field} is required"}), 400

    stylist = User.query.filter_by(id=data["stylist_id"], role="stylist", is_active=True, is_blacklisted=False).first()
    if not stylist:
        return jsonify({"error": "Stylist not found or unavailable"}), 404

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    service_id = data.get("service_id")
    if service_id and not Service.query.get(service_id):
        return jsonify({"error": "Service not found"}), 404

    try:
        appt = Appointment(
            stylist_id=data["stylist_id"],
            service_id=service_id,
            customer_name=data["customer_name"],
            customer_phone=data["customer_phone"],
            appointment_date=now.date(),
            appointment_time=now.time().replace(second=0, microsecond=0),
            reason=data.get("reason"),
            status="WalkIn",
            is_walkin=True,
        )
        db.session.add(appt)
        db.session.commit()
        clear_cache_pattern("appointments:*")
        return jsonify(appt.to_dict(include_stylist=True)), 201
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Failed to register walk-in"}), 500


@bp.route("/appointments/lookup", methods=["GET"])
def lookup_appointments():
    """Look up appointments by customer phone number."""
    phone = request.args.get("phone")
    if not phone:
        return jsonify({"error": "phone query parameter required"}), 400
    appointments = Appointment.query.filter_by(customer_phone=phone).order_by(
        Appointment.appointment_date.desc()
    ).all()
    return jsonify([a.to_dict(include_stylist=True) for a in appointments]), 200

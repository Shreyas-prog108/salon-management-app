import os
import uuid
from calendar import monthrange
from collections import defaultdict
from datetime import date, datetime, timedelta

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy import case, func, or_
from werkzeug.utils import secure_filename

from app import db
from app.utils.availability import seed_weekly_availability_from_operating_hours
from app.utils.decorators import role_required
from app.utils.helpers import clear_cache_pattern, get_cache, set_cache
from app.utils.security import validate_password_complexity
from models import Appointment, AppointmentSlot, SalonOperatingHours, Service, ServiceRecord, StylistAvailability, User


bp = Blueprint("admin", __name__, url_prefix="/api/admin")
OCCUPANCY_STATUSES = ("Booked", "WalkIn", "Completed")


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


def _iter_dates(start_date, end_date):
    current = start_date
    while current <= end_date:
        yield current
        current += timedelta(days=1)


def _slot_sort_key(time_slot):
    hours, minutes = time_slot.split(":")
    return int(hours), int(minutes)


def _slot_count_between(slot_date, start_time, end_time):
    count = 0
    current_dt = datetime.combine(slot_date, start_time)
    end_dt = datetime.combine(slot_date, end_time)
    while current_dt < end_dt:
        count += 1
        current_dt += timedelta(minutes=30)
    return count


def _get_slot_sequence_for_date(query_date):
    operating_hours = SalonOperatingHours.query.filter_by(day_of_week=query_date.weekday()).first()
    if not operating_hours or not operating_hours.is_open or not operating_hours.open_time or not operating_hours.close_time:
        return []

    slots = []
    current_dt = datetime.combine(query_date, operating_hours.open_time)
    end_dt = datetime.combine(query_date, operating_hours.close_time)
    while current_dt < end_dt:
        slots.append(current_dt.strftime("%H:%M"))
        current_dt += timedelta(minutes=30)
    return slots


def _get_total_seats_for_date(query_date):
    operating_hours = SalonOperatingHours.query.filter_by(day_of_week=query_date.weekday()).first()
    if operating_hours and operating_hours.total_seats:
        try:
            return max(int(operating_hours.total_seats), 1)
        except (TypeError, ValueError):
            pass
    try:
        return max(int(current_app.config.get("SALON_TOTAL_SEATS", 3) or 3), 1)
    except (TypeError, ValueError):
        return 3


def _build_slot_usage(start_date, end_date):
    slot_rows = (
        db.session.query(
            AppointmentSlot.appointment_date,
            AppointmentSlot.time_slot,
            AppointmentSlot.seat_id,
            AppointmentSlot.stylist_id,
            AppointmentSlot.appointment_id,
            Appointment.customer_name,
        )
        .join(Appointment, Appointment.id == AppointmentSlot.appointment_id)
        .filter(
            AppointmentSlot.appointment_date >= start_date,
            AppointmentSlot.appointment_date <= end_date,
            Appointment.status.in_(OCCUPANCY_STATUSES),
        )
        .order_by(AppointmentSlot.appointment_date.asc(), AppointmentSlot.time_slot.asc(), AppointmentSlot.stylist_id.asc())
        .all()
    )

    slot_usage = {}
    for row in slot_rows:
        key = (row.appointment_date, row.time_slot)
        details = slot_usage.setdefault(
            key,
            {
                "occupied_seat_ids": set(),
                "occupied_stylist_ids": set(),
                "appointment_ids": set(),
                "busy_stylists": {},
            },
        )
        details["occupied_seat_ids"].add(row.seat_id)
        details["occupied_stylist_ids"].add(row.stylist_id)
        details["appointment_ids"].add(row.appointment_id)
        details["busy_stylists"][row.stylist_id] = row.customer_name
    return slot_usage


def _build_daily_slot_overview(selected_date, active_stylists, slot_usage):
    slot_sequence = _get_slot_sequence_for_date(selected_date)
    if not slot_sequence:
        slot_sequence = sorted(
            [time_slot for (slot_date, time_slot) in slot_usage.keys() if slot_date == selected_date],
            key=_slot_sort_key,
        )

    total_seats = _get_total_seats_for_date(selected_date)
    slot_overview = []
    for time_slot in slot_sequence:
        details = slot_usage.get(
            (selected_date, time_slot),
            {"occupied_seat_ids": set(), "busy_stylists": {}, "appointment_ids": set()},
        )
        occupied_seat_ids = sorted(details["occupied_seat_ids"])
        occupied_seats = len(occupied_seat_ids)
        barber_assignments = []
        for stylist in active_stylists:
            customer_name = details["busy_stylists"].get(stylist.id)
            barber_assignments.append(
                {
                    "stylist_id": stylist.id,
                    "barber_name": stylist.full_name,
                    "status": "occupied" if customer_name else "free",
                    "customer_name": customer_name,
                }
            )

        slot_overview.append(
            {
                "time_slot": time_slot,
                "total_seats": total_seats,
                "occupied_seats": occupied_seats,
                "available_seats": max(total_seats - occupied_seats, 0),
                "occupied_seat_ids": occupied_seat_ids,
                "appointment_count": len(details["appointment_ids"]),
                "occupancy_rate": round((occupied_seats / total_seats) * 100, 1) if total_seats else 0.0,
                "barber_assignments": barber_assignments,
            }
        )
    return slot_overview


def _build_seat_matrix(start_date, end_date, slot_usage, mode):
    dates = list(_iter_dates(start_date, end_date))
    slot_sequence = set()
    for query_date in dates:
        slot_sequence.update(_get_slot_sequence_for_date(query_date))
    for slot_date, time_slot in slot_usage.keys():
        if start_date <= slot_date <= end_date:
            slot_sequence.add(time_slot)
    ordered_slots = sorted(slot_sequence, key=_slot_sort_key)

    if mode == "week":
        columns = [
            {
                "date": query_date.isoformat(),
                "label": query_date.strftime("%a"),
                "sub_label": query_date.strftime("%d %b"),
                "is_today": query_date == date.today(),
            }
            for query_date in dates
        ]
        label = f"{start_date.strftime('%d %b')} - {end_date.strftime('%d %b %Y')}"
    else:
        columns = [
            {
                "date": query_date.isoformat(),
                "label": query_date.strftime("%d"),
                "sub_label": query_date.strftime("%a"),
                "is_today": query_date == date.today(),
            }
            for query_date in dates
        ]
        label = start_date.strftime("%B %Y")

    rows = []
    for time_slot in ordered_slots:
        cells = []
        for query_date in dates:
            total_seats = _get_total_seats_for_date(query_date)
            details = slot_usage.get(
                (query_date, time_slot),
                {"occupied_seat_ids": set(), "occupied_stylist_ids": set(), "appointment_ids": set()},
            )
            occupied_seat_ids = sorted(details["occupied_seat_ids"])
            occupied_seats = len(occupied_seat_ids)
            cells.append(
                {
                    "date": query_date.isoformat(),
                    "occupied_seats": occupied_seats,
                    "available_seats": max(total_seats - occupied_seats, 0),
                    "total_seats": total_seats,
                    "occupied_seat_ids": occupied_seat_ids,
                    "occupied_stylist_count": len(details["occupied_stylist_ids"]),
                    "appointment_count": len(details["appointment_ids"]),
                    "occupancy_rate": round((occupied_seats / total_seats) * 100, 1) if total_seats else 0.0,
                }
            )
        rows.append({"time_slot": time_slot, "cells": cells})

    return {"label": label, "columns": columns, "rows": rows}


def _build_stylist_occupancy(start_date, end_date):
    active_stylists = User.query.filter_by(role="stylist", is_active=True, is_blacklisted=False).order_by(User.full_name.asc()).all()
    stylist_ids = [stylist.id for stylist in active_stylists]
    if not stylist_ids:
        return []

    availability_rows = (
        StylistAvailability.query.filter(
            StylistAvailability.stylist_id.in_(stylist_ids),
            StylistAvailability.date >= start_date,
            StylistAvailability.date <= end_date,
            StylistAvailability.is_available.is_(True),
        )
        .all()
    )
    available_blocks = defaultdict(int)
    available_dates = defaultdict(set)
    for row in availability_rows:
        available_blocks[row.stylist_id] += _slot_count_between(row.date, row.start_time, row.end_time)
        available_dates[row.stylist_id].add(row.date)

    occupied_rows = (
        db.session.query(
            AppointmentSlot.stylist_id,
            AppointmentSlot.appointment_id,
        )
        .join(Appointment, Appointment.id == AppointmentSlot.appointment_id)
        .filter(
            AppointmentSlot.stylist_id.in_(stylist_ids),
            AppointmentSlot.appointment_date >= start_date,
            AppointmentSlot.appointment_date <= end_date,
            Appointment.status.in_(OCCUPANCY_STATUSES),
        )
        .all()
    )
    occupied_blocks = defaultdict(int)
    appointment_ids = defaultdict(set)
    for row in occupied_rows:
        occupied_blocks[row.stylist_id] += 1
        appointment_ids[row.stylist_id].add(row.appointment_id)

    appointment_rows = (
        Appointment.query.filter(
            Appointment.stylist_id.in_(stylist_ids),
            Appointment.appointment_date >= start_date,
            Appointment.appointment_date <= end_date,
        )
        .filter(Appointment.status.in_(["Booked", "WalkIn", "Completed", "Cancelled"]))
        .all()
    )
    appointment_summary = defaultdict(lambda: {"appointments": 0, "completed": 0, "walkins": 0, "cancelled": 0})
    for row in appointment_rows:
        summary = appointment_summary[row.stylist_id]
        summary["appointments"] += 1
        if row.status == "Completed":
            summary["completed"] += 1
        if row.status == "WalkIn":
            summary["walkins"] += 1
        if row.status == "Cancelled":
            summary["cancelled"] += 1

    items = []
    for stylist in active_stylists:
        available = available_blocks[stylist.id]
        occupied = occupied_blocks[stylist.id]
        summary = appointment_summary[stylist.id]
        items.append(
            {
                "stylist_id": stylist.id,
                "full_name": stylist.full_name,
                "occupied_blocks": occupied,
                "available_blocks": available,
                "occupancy_rate": round((occupied / available) * 100, 1) if available else 0.0,
                "appointments": summary["appointments"],
                "completed": summary["completed"],
                "walkins": summary["walkins"],
                "cancelled": summary["cancelled"],
                "scheduled_days": len(available_dates[stylist.id]),
                "distinct_bookings": len(appointment_ids[stylist.id]),
            }
        )
    return items


@bp.route("/dashboard", methods=["GET"])
@jwt_required()
@role_required("admin")
def dashboard():
    """Return admin dashboard summary metrics."""
    date_str = request.args.get("date")
    try:
        selected_date = date.fromisoformat(date_str) if date_str else date.today()
    except ValueError:
        return jsonify({"error": "Invalid date format, use YYYY-MM-DD"}), 400

    cache_key = f"admin:dashboard:{selected_date.isoformat()}"
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
    stylist_name_map = {user.id: user.full_name for user in User.query.filter_by(role="stylist").all()}
    stylist_utilization = [
        {"stylist_id": s.stylist_id, "completed": s.count, "full_name": stylist_name_map.get(s.stylist_id)}
        for s in stylist_stats
    ]

    active_stylists = User.query.filter_by(role="stylist", is_active=True, is_blacklisted=False).order_by(User.full_name.asc()).all()

    week_start = selected_date - timedelta(days=selected_date.weekday())
    week_end = week_start + timedelta(days=6)
    month_start = selected_date.replace(day=1)
    month_end = selected_date.replace(day=monthrange(selected_date.year, selected_date.month)[1])

    slot_usage = _build_slot_usage(min(week_start, month_start), max(week_end, month_end))
    slot_overview = _build_daily_slot_overview(selected_date, active_stylists, slot_usage)
    weekly_matrix = _build_seat_matrix(week_start, week_end, slot_usage, "week")
    monthly_matrix = _build_seat_matrix(month_start, month_end, slot_usage, "month")

    data = {
        "selected_date": selected_date.isoformat(),
        "selected_date_total_seats": _get_total_seats_for_date(selected_date),
        "selected_week_start": week_start.isoformat(),
        "selected_week_end": week_end.isoformat(),
        "selected_month_start": month_start.isoformat(),
        "selected_month_end": month_end.isoformat(),
        "total_stylists": total_stylists,
        "total_appointments": total_appointments,
        "today_appointments": today_appointments,
        "booked_appointments": booked_appointments,
        "walkin_appointments": walkin_appointments,
        "completed_appointments": completed_appointments,
        "cancelled_appointments": cancelled_appointments,
        "total_revenue": round(total_revenue, 2),
        "stylist_utilization": stylist_utilization,
        "slot_overview": slot_overview,
        "seat_analytics": {
            "week": weekly_matrix,
            "month": monthly_matrix,
        },
        "stylist_occupancy": {
            "week": {
                "label": weekly_matrix["label"],
                "items": _build_stylist_occupancy(week_start, week_end),
            },
            "month": {
                "label": monthly_matrix["label"],
                "items": _build_stylist_occupancy(month_start, month_end),
            },
        },
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
    complexity_error = validate_password_complexity(data["password"])
    if complexity_error:
        return jsonify({"error": complexity_error}), 400

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
        db.session.flush()
        db.session.add_all(seed_weekly_availability_from_operating_hours(stylist.id))
        db.session.commit()
        clear_cache_pattern("stylists:*")
        clear_cache_pattern("admin:dashboard:*")
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
            complexity_error = validate_password_complexity(data["new_password"])
            if complexity_error:
                return jsonify({"error": complexity_error}), 400
            stylist.set_password(data["new_password"])
        if "is_active" in data:
            stylist.is_active = data["is_active"]
        db.session.commit()
        clear_cache_pattern("stylists:*")
        clear_cache_pattern("admin:dashboard:*")
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
        clear_cache_pattern("admin:dashboard:*")
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
        appointment.slot_blocks.clear()
        db.session.commit()
        clear_cache_pattern("appointments:*")
        clear_cache_pattern("admin:dashboard:*")
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

            total_seats, total_seats_error = _parse_int_field(
                item.get("total_seats"),
                "total_seats",
                allow_null=False,
            )
            if total_seats_error:
                return jsonify({"error": f"{total_seats_error} for day_of_week {day}"}), 400
            if total_seats is None or total_seats < 1:
                return jsonify({"error": f"total_seats must be at least 1 for day_of_week {day}"}), 400

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
            record.total_seats = total_seats

        db.session.commit()
        clear_cache_pattern("admin:dashboard:*")
        hours = SalonOperatingHours.query.order_by(SalonOperatingHours.day_of_week).all()
        return jsonify([h.to_dict() for h in hours]), 200
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Failed to update operating hours"}), 500

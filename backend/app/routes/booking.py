from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from flask import Blueprint, current_app, jsonify, request
from sqlalchemy.exc import IntegrityError

from app import db
from app.utils.helpers import clear_cache_pattern, get_cache, set_cache
from models import (
    Appointment,
    AppointmentSlot,
    SalonOperatingHours,
    Service,
    StylistAvailability,
    StylistWeeklyAvailability,
    User,
)


bp = Blueprint("booking", __name__, url_prefix="/api/booking")

ACTIVE_APPOINTMENT_STATUSES = ("Booked", "WalkIn")
SLOT_INTERVAL_MINUTES = 30
DEFAULT_SERVICE_DURATION_MINUTES = 30
DEFAULT_TOTAL_SEATS = 3


def _get_total_seats(query_date=None):
    if query_date:
        operating_hours = SalonOperatingHours.query.filter_by(day_of_week=query_date.weekday()).first()
        if operating_hours and operating_hours.total_seats:
            try:
                return max(int(operating_hours.total_seats), 1)
            except (TypeError, ValueError):
                pass

    raw_value = current_app.config.get("SALON_TOTAL_SEATS") or DEFAULT_TOTAL_SEATS
    try:
        return max(int(raw_value), 1)
    except (TypeError, ValueError):
        return DEFAULT_TOTAL_SEATS


def _get_service(service_id):
    if not service_id:
        return None
    return Service.query.get(service_id)


def _get_bookable_service(service_id):
    service = _get_service(service_id)
    if not service or not service.is_active:
        return None
    return service


def _get_service_duration_minutes(service_id=None):
    service = _get_service(service_id)
    if service and service.duration_minutes:
        return service.duration_minutes
    return DEFAULT_SERVICE_DURATION_MINUTES


def _normalize_time_slot(slot_time):
    return time(slot_time.hour, (slot_time.minute // SLOT_INTERVAL_MINUTES) * SLOT_INTERVAL_MINUTES)


def _format_time(slot_time):
    return slot_time.strftime("%H:%M")


def _time_slot_to_minutes(slot_value):
    if isinstance(slot_value, str):
        hours, minutes = slot_value.split(":")
        return int(hours) * 60 + int(minutes)
    return slot_value.hour * 60 + slot_value.minute


def _combine_slot(slot_date, slot_time):
    return datetime.combine(slot_date, slot_time)


def _now_local():
    tz_name = current_app.config.get("SALON_TIMEZONE", "Asia/Kolkata")
    try:
        tzinfo = ZoneInfo(tz_name)
    except Exception:
        tzinfo = ZoneInfo("Asia/Kolkata")
    return datetime.now(tzinfo)


def _now_local_wall_clock():
    return _now_local().replace(tzinfo=None)


def _today_local():
    return _now_local().date()


def _normalize_request_time(slot_time, allow_rounding=False):
    normalized = _normalize_time_slot(slot_time.replace(second=0, microsecond=0))
    if allow_rounding:
        return normalized, None
    if slot_time.replace(second=0, microsecond=0) != normalized:
        return None, "appointment_time must align to 30-minute slots"
    return normalized, None


def _slot_strings_for_duration(slot_time, duration_minutes):
    start = datetime.combine(date.today(), _normalize_time_slot(slot_time))
    block_count = max((max(duration_minutes, SLOT_INTERVAL_MINUTES) + SLOT_INTERVAL_MINUTES - 1) // SLOT_INTERVAL_MINUTES, 1)
    return [
        (start + timedelta(minutes=SLOT_INTERVAL_MINUTES * index)).strftime("%H:%M")
        for index in range(block_count)
    ]


def _get_day_operating_hours(query_date):
    hours = SalonOperatingHours.query.filter_by(day_of_week=query_date.weekday()).first()
    if not hours or not hours.is_open or not hours.open_time or not hours.close_time:
        return None
    return hours


def _get_day_slot_times(query_date, service_id=None):
    operating_hours = _get_day_operating_hours(query_date)
    if not operating_hours:
        return []

    duration = timedelta(minutes=_get_service_duration_minutes(service_id))
    step = timedelta(minutes=SLOT_INTERVAL_MINUTES)
    current = _combine_slot(query_date, operating_hours.open_time)
    close_dt = _combine_slot(query_date, operating_hours.close_time)
    today_now = _now_local_wall_clock() if query_date == _today_local() else None
    slots = []

    while current + duration <= close_dt:
        if not today_now or current > today_now:
            slots.append(current.time().replace(second=0, microsecond=0))
        current += step
    return slots


def _stylist_offers_service(stylist, service_id):
    if not service_id:
        return True
    if stylist.service_id == service_id:
        return True
    return any(service.id == service_id for service in stylist.offered_services)


def _get_active_stylists(service_id=None):
    stylists = User.query.filter_by(role="stylist", is_active=True, is_blacklisted=False).all()
    if not service_id:
        return stylists
    return [stylist for stylist in stylists if _stylist_offers_service(stylist, service_id)]


def _serialize_stylist(stylist):
    return {
        "id": stylist.id,
        "full_name": stylist.full_name,
        "specialty": stylist.specialty,
        "experience_years": stylist.experience_years,
        "photo_url": stylist.photo_url,
    }


def _get_stylist_daily_windows(stylist_id, query_date):
    return (
        StylistAvailability.query.filter_by(
            stylist_id=stylist_id,
            date=query_date,
        )
        .order_by(StylistAvailability.start_time.asc())
        .all()
    )


def _get_stylist_weekly_window(stylist_id, query_date):
    return StylistWeeklyAvailability.query.filter_by(
        stylist_id=stylist_id,
        day_of_week=query_date.weekday(),
    ).first()


def _get_stylist_windows(stylist_id, query_date):
    daily_windows = _get_stylist_daily_windows(stylist_id, query_date)
    if daily_windows:
        return [window for window in daily_windows if window.is_available]

    weekly_window = _get_stylist_weekly_window(stylist_id, query_date)
    if not weekly_window or not weekly_window.is_available or not weekly_window.start_time or not weekly_window.end_time:
        return []
    return [weekly_window]


def _slot_rows_for_date(query_date, slot_strings=None):
    query = (
        db.session.query(AppointmentSlot)
        .join(Appointment, Appointment.id == AppointmentSlot.appointment_id)
        .filter(
            AppointmentSlot.appointment_date == query_date,
            Appointment.status.in_(ACTIVE_APPOINTMENT_STATUSES),
        )
    )
    if slot_strings:
        query = query.filter(AppointmentSlot.time_slot.in_(slot_strings))
    return query.all()


def _slot_rows_for_update(query_date, slot_strings, exclude_appointment_id=None):
    query = (
        db.session.query(AppointmentSlot)
        .join(Appointment, Appointment.id == AppointmentSlot.appointment_id)
        .filter(
            AppointmentSlot.appointment_date == query_date,
            AppointmentSlot.time_slot.in_(slot_strings),
            Appointment.status.in_(ACTIVE_APPOINTMENT_STATUSES),
        )
    )
    if exclude_appointment_id:
        query = query.filter(AppointmentSlot.appointment_id != exclude_appointment_id)
    return query.order_by(AppointmentSlot.id.asc()).with_for_update().all()


def _stylist_has_window(stylist_id, query_date, slot_time, duration_minutes):
    slot_start = _combine_slot(query_date, _normalize_time_slot(slot_time))
    slot_end = slot_start + timedelta(minutes=duration_minutes)
    for window in _get_stylist_windows(stylist_id, query_date):
        window_start = _combine_slot(query_date, window.start_time)
        window_end = _combine_slot(query_date, window.end_time)
        if window_start <= slot_start and slot_end <= window_end:
            return True
    return False


def _get_busy_slots_by_stylist(query_date):
    busy = {}
    for slot_row in _slot_rows_for_date(query_date):
        busy.setdefault(slot_row.stylist_id, set()).add(slot_row.time_slot)
    return busy


def _get_occupied_seat_ids(query_date, slot_strings):
    occupied = set()
    for slot_row in _slot_rows_for_date(query_date, slot_strings):
        occupied.add(slot_row.seat_id)
    return occupied


def getAvailableSeats(query_date, time_slot, service_id=None):
    duration_minutes = _get_service_duration_minutes(service_id)
    slot_strings = _slot_strings_for_duration(time_slot, duration_minutes)
    total_seats = _get_total_seats(query_date)
    occupied = _get_occupied_seat_ids(query_date, slot_strings)
    available_seat_ids = [seat_id for seat_id in range(1, total_seats + 1) if seat_id not in occupied]
    return {
        "total_seats": total_seats,
        "occupied_seats": total_seats - len(available_seat_ids),
        "available_seats": len(available_seat_ids),
        "available_seat_ids": available_seat_ids,
    }


def _stylist_is_available_for_slot(stylist, query_date, slot_time, service_id=None, busy_slots_by_stylist=None):
    duration_minutes = _get_service_duration_minutes(service_id)
    if not _stylist_has_window(stylist.id, query_date, slot_time, duration_minutes):
        return False
    slot_strings = _slot_strings_for_duration(slot_time, duration_minutes)
    busy_slots = (busy_slots_by_stylist or {}).get(stylist.id, set())
    return all(slot_string not in busy_slots for slot_string in slot_strings)


def _get_stylist_open_slots(stylist_id, query_date, service_id=None, busy_slots_by_stylist=None):
    stylist = User.query.filter_by(id=stylist_id, role="stylist", is_active=True, is_blacklisted=False).first()
    if not stylist:
        return []
    return [
        _format_time(slot_time)
        for slot_time in _get_day_slot_times(query_date, service_id)
        if _stylist_is_available_for_slot(stylist, query_date, slot_time, service_id, busy_slots_by_stylist)
    ]


def getAvailableBarbers(query_date, time_slot, service_id=None):
    busy_slots_by_stylist = _get_busy_slots_by_stylist(query_date)
    return [
        stylist
        for stylist in _get_active_stylists(service_id)
        if _stylist_is_available_for_slot(stylist, query_date, time_slot, service_id, busy_slots_by_stylist)
    ]


def _get_slot_status(available_seats, total_seats, barber_count):
    if available_seats <= 0 or barber_count <= 0:
        return "full"
    if available_seats == 1 or barber_count == 1 or available_seats <= max(total_seats // 2, 1):
        return "filling_fast"
    return "available"


def _build_slot_payload(query_date, slot_time, service_id=None, forced_barbers=None, busy_slots_by_stylist=None):
    seat_data = getAvailableSeats(query_date, slot_time, service_id)
    available_barbers = forced_barbers
    if available_barbers is None:
        available_barbers = [
            stylist
            for stylist in _get_active_stylists(service_id)
            if _stylist_is_available_for_slot(stylist, query_date, slot_time, service_id, busy_slots_by_stylist)
        ]

    barber_data = [_serialize_stylist(stylist) for stylist in available_barbers]
    return {
        "date": query_date.isoformat(),
        "time_slot": _format_time(_normalize_time_slot(slot_time)),
        "seat_summary": seat_data,
        "available_barbers": barber_data,
        "available_barber_count": len(barber_data),
        "status": _get_slot_status(seat_data["available_seats"], seat_data["total_seats"], len(barber_data)),
    }


def _list_availability_for_date(query_date, service_id=None):
    busy_slots_by_stylist = _get_busy_slots_by_stylist(query_date)
    stylists = _get_active_stylists(service_id)
    slot_payloads = []
    for slot_time in _get_day_slot_times(query_date, service_id):
        available_barbers = [
            stylist
            for stylist in stylists
            if _stylist_is_available_for_slot(stylist, query_date, slot_time, service_id, busy_slots_by_stylist)
        ]
        slot_payloads.append(
            _build_slot_payload(
                query_date,
                slot_time,
                service_id,
                forced_barbers=available_barbers,
                busy_slots_by_stylist=busy_slots_by_stylist,
            )
        )
    return slot_payloads


def _window_slot_payloads(slot_payloads, around_time=None, window_slots=None, window_mode="center"):
    if not around_time or not window_slots:
        return slot_payloads

    try:
        window_slots = max(int(window_slots), 1)
    except (TypeError, ValueError):
        return slot_payloads

    if len(slot_payloads) <= window_slots:
        return slot_payloads

    target_minutes = _time_slot_to_minutes(around_time)
    if window_mode == "forward":
        start_index = next(
            (
                index
                for index, payload in enumerate(slot_payloads)
                if _time_slot_to_minutes(payload["time_slot"]) >= target_minutes
            ),
            len(slot_payloads),
        )
        end_index = start_index + window_slots
        return slot_payloads[start_index:end_index]

    anchor_index = min(
        range(len(slot_payloads)),
        key=lambda index: abs(_time_slot_to_minutes(slot_payloads[index]["time_slot"]) - target_minutes),
    )
    half_window = window_slots // 2
    start_index = max(min(anchor_index - half_window, len(slot_payloads) - window_slots), 0)
    end_index = start_index + window_slots
    return slot_payloads[start_index:end_index]


def _same_day_nearby_slots(query_date, slot_time, service_id=None, window_slots=5):
    return _window_slot_payloads(
        _list_availability_for_date(query_date, service_id),
        around_time=slot_time,
        window_slots=window_slots,
    )


def getBarberSchedule(stylist_id, start_date=None, days=14, service_id=None):
    stylist = User.query.filter_by(
        id=stylist_id,
        role="stylist",
        is_active=True,
        is_blacklisted=False,
    ).first()
    if not stylist:
        return None

    schedule_start = start_date or _today_local()
    max_days = min(max(days, 1), 21)
    results = []
    for offset in range(max_days):
        query_date = schedule_start + timedelta(days=offset)
        busy_slots_by_stylist = _get_busy_slots_by_stylist(query_date)
        slots = _get_stylist_open_slots(stylist_id, query_date, service_id, busy_slots_by_stylist)
        if not slots:
            continue
        results.append(
            {
                "date": query_date.isoformat(),
                "time_slots": [
                    _build_slot_payload(
                        query_date,
                        time.fromisoformat(slot),
                        service_id,
                        forced_barbers=[stylist],
                        busy_slots_by_stylist=busy_slots_by_stylist,
                    )
                    for slot in slots
                ],
            }
        )
    return {"stylist": _serialize_stylist(stylist), "dates": results}


def _find_first_available_same_day(query_date, after_time, service_id=None):
    for slot_time in _get_day_slot_times(query_date, service_id):
        if slot_time <= after_time:
            continue
        payload = _build_slot_payload(query_date, slot_time, service_id)
        if payload["status"] != "full":
            payload["label"] = "Next available today"
            return payload
    return None


def _find_nearby_same_day_options(query_date, slot_time, service_id=None, limit=4):
    current_label = _format_time(_normalize_time_slot(slot_time))
    nearby = []
    for payload in _same_day_nearby_slots(query_date, slot_time, service_id, window_slots=max(limit + 1, 5)):
        if payload["time_slot"] == current_label or payload["status"] == "full":
            continue
        delta_minutes = _time_slot_to_minutes(payload["time_slot"]) - _time_slot_to_minutes(slot_time)
        if delta_minutes == 0:
            continue
        payload = dict(payload)
        payload["label"] = f"{abs(delta_minutes)} min {'later' if delta_minutes > 0 else 'earlier'}"
        nearby.append(payload)
        if len(nearby) >= limit:
            break
    return nearby


def _find_same_time_option(query_date, slot_time, label, service_id=None):
    payload = _build_slot_payload(query_date, slot_time, service_id)
    if payload["status"] == "full":
        return None
    payload["label"] = label
    return payload


def _find_weekend_option(query_date, slot_time, service_id=None):
    for offset in range(1, 29):
        candidate_date = query_date + timedelta(days=offset)
        if candidate_date.weekday() not in (5, 6):
            continue
        payload = _find_same_time_option(candidate_date, slot_time, "Weekend option", service_id)
        if payload:
            return payload
    return None


def _build_suggestions(query_date, slot_time, service_id=None):
    suggestions = []
    candidates = _find_nearby_same_day_options(query_date, slot_time, service_id) + [
        _find_first_available_same_day(query_date, slot_time, service_id),
        _find_same_time_option(query_date + timedelta(days=1), slot_time, "Same time tomorrow", service_id),
        _find_same_time_option(query_date + timedelta(days=7), slot_time, "Same time next week", service_id),
        _find_weekend_option(query_date, slot_time, service_id),
    ]
    seen = set()
    for candidate in candidates:
        if not candidate:
            continue
        key = (candidate["date"], candidate["time_slot"])
        if key in seen:
            continue
        seen.add(key)
        suggestions.append(candidate)
    return suggestions


def _ordered_stylists_for_slot(
    query_date,
    slot_time,
    service_id=None,
    requested_stylist=None,
    busy_slots_by_stylist=None,
):
    busy_slots_by_stylist = busy_slots_by_stylist or _get_busy_slots_by_stylist(query_date)
    if requested_stylist:
        return (
            [requested_stylist]
            if _stylist_is_available_for_slot(requested_stylist, query_date, slot_time, service_id, busy_slots_by_stylist)
            else []
        )

    available_stylists = [
        stylist
        for stylist in _get_active_stylists(service_id)
        if _stylist_is_available_for_slot(stylist, query_date, slot_time, service_id, busy_slots_by_stylist)
    ]
    appointment_counts = {
        stylist.id: Appointment.query.filter_by(
            stylist_id=stylist.id,
            appointment_date=query_date,
        )
        .filter(Appointment.status.in_(ACTIVE_APPOINTMENT_STATUSES))
        .count()
        for stylist in available_stylists
    }
    return sorted(available_stylists, key=lambda stylist: (appointment_counts.get(stylist.id, 0), stylist.full_name or ""))


def _build_appointment_slot_rows(appointment, slot_strings):
    return [
        AppointmentSlot(
            appointment_id=appointment.id,
            appointment_date=appointment.appointment_date,
            time_slot=slot_string,
            seat_id=appointment.seat_id,
            stylist_id=appointment.stylist_id,
        )
        for slot_string in slot_strings
    ]


def _create_appointment_transaction(
    *,
    appt_date,
    slot_time,
    service_id,
    customer_name,
    customer_phone,
    customer_email=None,
    reason=None,
    requested_stylist=None,
    requested_seat_id=None,
    status="Booked",
    is_walkin=False,
):
    duration_minutes = _get_service_duration_minutes(service_id)
    slot_strings = _slot_strings_for_duration(slot_time, duration_minutes)
    last_error = None
    total_seats = _get_total_seats(appt_date)
    max_attempts = max(total_seats, 1) + 2
    for _ in range(max_attempts):
        try:
            locked_rows = _slot_rows_for_update(appt_date, slot_strings)
            occupied_seat_ids = {row.seat_id for row in locked_rows}
            busy_slots_by_stylist = {}
            for row in locked_rows:
                busy_slots_by_stylist.setdefault(row.stylist_id, set()).add(row.time_slot)

            available_seat_ids = [
                seat_id for seat_id in range(1, total_seats + 1) if seat_id not in occupied_seat_ids
            ]
            if requested_seat_id and requested_seat_id not in available_seat_ids:
                return None, "Requested seat is no longer available"

            seat_candidates = [requested_seat_id] if requested_seat_id else available_seat_ids
            if not seat_candidates:
                return None, "No seats are available for this time slot"

            stylist_candidates = _ordered_stylists_for_slot(
                appt_date,
                slot_time,
                service_id,
                requested_stylist,
                busy_slots_by_stylist,
            )
            if not stylist_candidates:
                return (
                    None,
                    "Selected barber is not available for this time slot"
                    if requested_stylist
                    else "No barbers are available for this time slot",
                )

            appointment = Appointment(
                stylist_id=stylist_candidates[0].id,
                service_id=service_id,
                seat_id=seat_candidates[0],
                time_slot=slot_strings[0],
                customer_name=customer_name,
                customer_phone=customer_phone,
                customer_email=customer_email,
                appointment_date=appt_date,
                appointment_time=slot_time,
                reason=reason,
                status=status,
                is_walkin=is_walkin,
            )

            db.session.add(appointment)
            db.session.flush()
            db.session.add_all(_build_appointment_slot_rows(appointment, slot_strings))
            db.session.commit()
            return appointment, None
        except IntegrityError:
            db.session.rollback()
            last_error = "That seat or barber was just taken. Please try another available option."
        except Exception:
            db.session.rollback()
            raise
    return None, last_error or "No seats are available for this time slot"


def _is_future_slot(query_date, slot_time):
    if query_date > _today_local():
        return True
    if query_date < _today_local():
        return False
    return _combine_slot(query_date, slot_time) > _now_local_wall_clock()


def _candidate_reschedule_payloads(appointment):
    current_payload = _build_slot_payload(
        appointment.appointment_date,
        appointment.appointment_time,
        appointment.service_id,
    )
    candidates = []
    if current_payload["status"] != "full":
        current_payload = dict(current_payload)
        current_payload["label"] = "Same time, next available barber"
        candidates.append(current_payload)
    candidates.extend(
        _build_suggestions(
            appointment.appointment_date,
            appointment.appointment_time,
            appointment.service_id,
        )
    )

    seen = set()
    deduped = []
    for candidate in candidates:
        key = (candidate["date"], candidate["time_slot"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(candidate)
    return deduped


def _move_appointment_transaction(appointment_id, *, appt_date, slot_time, requested_stylist=None, requested_seat_id=None):
    appointment = Appointment.query.get(appointment_id)
    if not appointment:
        return None, "Appointment not found"

    duration_minutes = _get_service_duration_minutes(appointment.service_id)
    slot_strings = _slot_strings_for_duration(slot_time, duration_minutes)
    last_error = None
    total_seats = _get_total_seats(appt_date)
    max_attempts = max(total_seats, 1) + 2

    for _ in range(max_attempts):
        try:
            appointment = Appointment.query.get(appointment_id)
            locked_rows = _slot_rows_for_update(
                appt_date,
                slot_strings,
                exclude_appointment_id=appointment_id,
            )
            occupied_seat_ids = {row.seat_id for row in locked_rows}
            busy_slots_by_stylist = {}
            for row in locked_rows:
                busy_slots_by_stylist.setdefault(row.stylist_id, set()).add(row.time_slot)

            available_seat_ids = [
                seat_id for seat_id in range(1, total_seats + 1) if seat_id not in occupied_seat_ids
            ]
            if requested_seat_id and requested_seat_id not in available_seat_ids:
                return None, "Requested seat is no longer available"

            seat_candidates = []
            if requested_seat_id:
                seat_candidates.append(requested_seat_id)
            elif appointment.seat_id in available_seat_ids:
                seat_candidates.append(appointment.seat_id)
            seat_candidates.extend(
                seat_id for seat_id in available_seat_ids if seat_id not in seat_candidates
            )
            if not seat_candidates:
                return None, "No seats are available for this time slot"

            stylist_candidates = _ordered_stylists_for_slot(
                appt_date,
                slot_time,
                appointment.service_id,
                requested_stylist,
                busy_slots_by_stylist,
            )
            if not stylist_candidates:
                return None, "No barbers are available for this time slot"

            appointment.slot_blocks.clear()
            db.session.flush()

            appointment.stylist_id = stylist_candidates[0].id
            appointment.seat_id = seat_candidates[0]
            appointment.appointment_date = appt_date
            appointment.appointment_time = slot_time
            appointment.time_slot = slot_strings[0]
            db.session.add_all(_build_appointment_slot_rows(appointment, slot_strings))
            db.session.commit()
            return appointment, None
        except IntegrityError:
            db.session.rollback()
            last_error = "That seat or barber was just taken. Please try another available option."
        except Exception:
            db.session.rollback()
            raise

    return None, last_error or "No seats are available for this time slot"


def reconcile_appointment_after_barber_availability_change(appointment_id):
    appointment = Appointment.query.get(appointment_id)
    if not appointment:
        return {"action": "missing"}
    if appointment.status != "Booked":
        return {"action": "skipped", "reason": "status"}
    if not _is_future_slot(appointment.appointment_date, appointment.appointment_time):
        return {"action": "skipped", "reason": "past"}
    if _stylist_has_window(
        appointment.stylist_id,
        appointment.appointment_date,
        appointment.appointment_time,
        _get_service_duration_minutes(appointment.service_id),
    ):
        return {"action": "skipped", "reason": "still_available"}

    previous = {
        "appointment_id": appointment.id,
        "customer_name": appointment.customer_name,
        "customer_phone": appointment.customer_phone,
        "customer_email": appointment.customer_email,
        "service_name": appointment.service.name if appointment.service else "General Service",
        "old_date": appointment.appointment_date.isoformat(),
        "old_time": _format_time(appointment.appointment_time),
        "old_stylist_name": appointment.stylist.full_name if appointment.stylist else "Your barber",
    }

    for candidate in _candidate_reschedule_payloads(appointment):
        moved_appointment, error = _move_appointment_transaction(
            appointment.id,
            appt_date=date.fromisoformat(candidate["date"]),
            slot_time=time.fromisoformat(candidate["time_slot"]),
        )
        if moved_appointment:
            return {
                **previous,
                "action": "rescheduled",
                "new_date": moved_appointment.appointment_date.isoformat(),
                "new_time": _format_time(moved_appointment.appointment_time),
                "new_stylist_name": moved_appointment.stylist.full_name if moved_appointment.stylist else previous["old_stylist_name"],
                "label": candidate.get("label"),
            }
        if error:
            previous["last_error"] = error

    try:
        appointment = Appointment.query.get(appointment_id)
        appointment.status = "Cancelled"
        appointment.slot_blocks.clear()
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise

    return {**previous, "action": "cancelled"}


@bp.route("/services", methods=["GET"])
def get_services():
    cache_key = "services:active"
    cached = get_cache(cache_key)
    if cached:
        return jsonify(cached), 200
    services = Service.query.filter_by(is_active=True).all()
    data = [service.to_dict() for service in services]
    set_cache(cache_key, data, expire=300)
    return jsonify(data), 200


@bp.route("/stylists", methods=["GET"])
def get_stylists():
    service_id = request.args.get("service_id", type=int)
    if service_id and not _get_bookable_service(service_id):
        return jsonify({"error": "Selected service is not currently offered by the salon"}), 409
    return jsonify([stylist.to_dict() for stylist in _get_active_stylists(service_id)]), 200


@bp.route("/availability", methods=["GET"])
def get_date_availability():
    date_str = request.args.get("date")
    if not date_str:
        return jsonify({"error": "date query parameter required (YYYY-MM-DD)"}), 400
    try:
        query_date = date.fromisoformat(date_str)
    except ValueError:
        return jsonify({"error": "Invalid date format, use YYYY-MM-DD"}), 400

    service_id = request.args.get("service_id", type=int)
    if service_id and not _get_bookable_service(service_id):
        return jsonify({"error": "Selected service is not currently offered by the salon"}), 409

    around_time = request.args.get("around_time")
    around_time_value = None
    if around_time:
        try:
            around_time_value = _normalize_time_slot(time.fromisoformat(around_time))
        except ValueError:
            return jsonify({"error": "Invalid around_time format, use HH:MM"}), 400

    window_slots = request.args.get("window_slots", default=None, type=int)
    window_mode = str(request.args.get("window_mode", "center") or "center").strip().lower()
    if window_mode not in {"center", "forward"}:
        window_mode = "center"
    slot_payloads = _list_availability_for_date(query_date, service_id)
    return jsonify(_window_slot_payloads(slot_payloads, around_time_value, window_slots, window_mode)), 200


@bp.route("/availability/details", methods=["GET"])
def get_slot_details():
    date_str = request.args.get("date")
    time_slot = request.args.get("time_slot")
    if not date_str or not time_slot:
        return jsonify({"error": "date and time_slot query parameters are required"}), 400
    try:
        query_date = date.fromisoformat(date_str)
        slot_time_raw = time.fromisoformat(time_slot)
    except ValueError:
        return jsonify({"error": "Invalid date or time format"}), 400

    slot_time, time_error = _normalize_request_time(slot_time_raw)
    if time_error:
        return jsonify({"error": time_error}), 400

    service_id = request.args.get("service_id", type=int)
    if service_id and not _get_bookable_service(service_id):
        return jsonify({"error": "Selected service is not currently offered by the salon"}), 409

    payload = _build_slot_payload(query_date, slot_time, service_id)
    payload["nearby_slots"] = _same_day_nearby_slots(query_date, slot_time, service_id, window_slots=5)
    payload["suggestions"] = _build_suggestions(query_date, slot_time, service_id)
    return jsonify(payload), 200


@bp.route("/stylists/<int:stylist_id>/availability", methods=["GET"])
def get_stylist_availability(stylist_id):
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

    service_id = request.args.get("service_id", type=int)
    if service_id and not _get_bookable_service(service_id):
        return jsonify({"error": "Selected service is not currently offered by the salon"}), 409
    return jsonify(_get_stylist_open_slots(stylist_id, query_date, service_id, _get_busy_slots_by_stylist(query_date))), 200


@bp.route("/stylists/<int:stylist_id>/schedule", methods=["GET"])
def get_barber_schedule(stylist_id):
    start_date_str = request.args.get("start_date")
    days = request.args.get("days", default=14, type=int)
    service_id = request.args.get("service_id", type=int)
    if service_id and not _get_bookable_service(service_id):
        return jsonify({"error": "Selected service is not currently offered by the salon"}), 409

    if start_date_str:
        try:
            start_date = date.fromisoformat(start_date_str)
        except ValueError:
            return jsonify({"error": "Invalid start_date format, use YYYY-MM-DD"}), 400
    else:
        start_date = _today_local()

    schedule = getBarberSchedule(stylist_id, start_date, days, service_id)
    if not schedule:
        return jsonify({"error": "Stylist not found"}), 404
    return jsonify(schedule), 200


@bp.route("/appointments", methods=["POST"])
def create_appointment():
    data = request.get_json(silent=True) or {}
    required = ["customer_name", "customer_phone", "appointment_date", "appointment_time"]
    for field in required:
        if not data.get(field):
            return jsonify({"error": f"{field} is required"}), 400

    import re

    phone = str(data["customer_phone"]).strip()
    if not re.fullmatch(r"[0-9]{10}", phone):
        return jsonify({"error": "customer_phone must be a 10-digit number"}), 400

    customer_email = str(data.get("customer_email", "")).strip() or None
    if customer_email and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", customer_email):
        return jsonify({"error": "Invalid email format"}), 400

    try:
        appt_date = date.fromisoformat(data["appointment_date"])
        slot_time_raw = time.fromisoformat(data["appointment_time"])
    except ValueError:
        return jsonify({"error": "Invalid appointment_date or appointment_time format"}), 400

    slot_time, time_error = _normalize_request_time(slot_time_raw)
    if time_error:
        return jsonify({"error": time_error}), 400
    if appt_date < _today_local() or _combine_slot(appt_date, slot_time) <= _now_local_wall_clock():
        return jsonify({"error": "Cannot book appointments in the past"}), 400

    service_id = data.get("service_id")
    if service_id and not _get_bookable_service(service_id):
        return jsonify({"error": "Selected service is not currently offered by the salon"}), 409

    requested_stylist_id = data.get("stylist_id") or data.get("barber_id")
    requested_stylist = None
    if requested_stylist_id:
        requested_stylist = User.query.filter_by(
            id=requested_stylist_id,
            role="stylist",
            is_active=True,
            is_blacklisted=False,
        ).first()
        if not requested_stylist:
            return jsonify({"error": "Stylist not found or unavailable"}), 404
        if service_id and not _stylist_offers_service(requested_stylist, service_id):
            return jsonify({"error": "Selected barber does not offer this service"}), 409

    try:
        requested_seat_id = int(data["seat_id"]) if data.get("seat_id") not in (None, "") else None
    except (TypeError, ValueError):
        return jsonify({"error": "seat_id must be an integer"}), 400

    try:
        slot_details = _build_slot_payload(appt_date, slot_time, service_id)
        suggestions = _build_suggestions(appt_date, slot_time, service_id)
        if slot_details["seat_summary"]["available_seats"] <= 0:
            return jsonify({"error": "All seats are occupied for this time slot", "suggestions": suggestions}), 409

        appointment, error = _create_appointment_transaction(
            appt_date=appt_date,
            slot_time=slot_time,
            service_id=service_id,
            customer_name=data["customer_name"],
            customer_phone=phone,
            customer_email=customer_email,
            reason=data.get("reason"),
            requested_stylist=requested_stylist,
            requested_seat_id=requested_seat_id,
            status="Booked",
            is_walkin=False,
        )
        if not appointment:
            response = {"error": error or "Failed to create appointment", "suggestions": suggestions}
            if requested_stylist:
                response["available_barbers"] = [
                    _serialize_stylist(stylist) for stylist in getAvailableBarbers(appt_date, slot_time, service_id)
                ]
            return jsonify(response), 409
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Failed to create appointment"}), 500

    try:
        from celery_tasks import send_appointment_booking_confirmation

        send_appointment_booking_confirmation.delay(appointment.id)
    except Exception:
        pass

    clear_cache_pattern("appointments:*")
    clear_cache_pattern("admin:dashboard:*")
    return jsonify(appointment.to_dict(include_stylist=True)), 201


@bp.route("/walkin", methods=["POST"])
def create_walkin():
    data = request.get_json(silent=True) or {}
    required = ["stylist_id", "customer_name", "customer_phone"]
    for field in required:
        if not data.get(field):
            return jsonify({"error": f"{field} is required"}), 400

    stylist = User.query.filter_by(
        id=data["stylist_id"],
        role="stylist",
        is_active=True,
        is_blacklisted=False,
    ).first()
    if not stylist:
        return jsonify({"error": "Stylist not found or unavailable"}), 404

    service_id = data.get("service_id")
    if service_id and not _get_bookable_service(service_id):
        return jsonify({"error": "Selected service is not currently offered by the salon"}), 409
    if service_id and not _stylist_offers_service(stylist, service_id):
        return jsonify({"error": "Selected barber does not offer this service"}), 409

    import re

    phone = str(data["customer_phone"]).strip()
    if not re.fullmatch(r"[0-9]{10}", phone):
        return jsonify({"error": "customer_phone must be a 10-digit number"}), 400
    try:
        requested_seat_id = int(data["seat_id"]) if data.get("seat_id") not in (None, "") else None
    except (TypeError, ValueError):
        return jsonify({"error": "seat_id must be an integer"}), 400

    now = _now_local_wall_clock()
    appt_date = now.date()
    slot_time, _ = _normalize_request_time(now.time(), allow_rounding=True)
    try:
        appointment, error = _create_appointment_transaction(
            appt_date=appt_date,
            slot_time=slot_time,
            service_id=service_id,
            customer_name=data["customer_name"],
            customer_phone=phone,
            customer_email=None,
            reason=data.get("reason"),
            requested_stylist=stylist,
            requested_seat_id=requested_seat_id,
            status="WalkIn",
            is_walkin=True,
        )
        if not appointment:
            return jsonify({"error": error or "Failed to register walk-in"}), 409
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Failed to register walk-in"}), 500

    clear_cache_pattern("appointments:*")
    clear_cache_pattern("admin:dashboard:*")
    return jsonify(appointment.to_dict(include_stylist=True)), 201


@bp.route("/appointments/lookup", methods=["GET"])
def lookup_appointments():
    phone = request.args.get("phone")
    if not phone:
        return jsonify({"error": "phone query parameter required"}), 400
    appointments = Appointment.query.filter_by(customer_phone=phone).order_by(
        Appointment.appointment_date.desc(),
        Appointment.appointment_time.desc(),
    ).all()
    return jsonify([appointment.to_dict(include_stylist=True) for appointment in appointments]), 200

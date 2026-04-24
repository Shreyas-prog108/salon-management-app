from models import SalonOperatingHours, StylistWeeklyAvailability


def seed_weekly_availability_from_operating_hours(stylist_id, *, force_missing_only=True):
    existing_rows = {
        row.day_of_week: row
        for row in StylistWeeklyAvailability.query.filter_by(stylist_id=stylist_id).all()
    }
    operating_hours = {
        row.day_of_week: row for row in SalonOperatingHours.query.order_by(SalonOperatingHours.day_of_week.asc()).all()
    }

    created_or_updated = []
    for day_of_week in range(7):
        if force_missing_only and day_of_week in existing_rows:
            continue

        hours = operating_hours.get(day_of_week)
        is_open = bool(hours and hours.is_open and hours.open_time and hours.close_time)
        row = existing_rows.get(day_of_week)
        if row is None:
            row = StylistWeeklyAvailability(stylist_id=stylist_id, day_of_week=day_of_week)

        row.start_time = hours.open_time if is_open else None
        row.end_time = hours.close_time if is_open else None
        row.is_available = is_open
        created_or_updated.append(row)

    return created_or_updated


def build_weekly_availability_payload(stylist_id):
    rows = {
        row.day_of_week: row
        for row in StylistWeeklyAvailability.query.filter_by(stylist_id=stylist_id).order_by(StylistWeeklyAvailability.day_of_week.asc()).all()
    }
    payload = []
    for day_of_week in range(7):
        row = rows.get(day_of_week)
        if row:
            payload.append(row.to_dict())
        else:
            payload.append(
                {
                    "id": None,
                    "stylist_id": stylist_id,
                    "day_of_week": day_of_week,
                    "start_time": None,
                    "end_time": None,
                    "is_available": False,
                }
            )
    return payload

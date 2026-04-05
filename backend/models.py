from datetime import datetime, timezone

from werkzeug.security import check_password_hash, generate_password_hash

from app import db


# Association table for stylist ↔ services (many-to-many)
stylist_services = db.Table(
    "stylist_services",
    db.Column("stylist_id", db.Integer, db.ForeignKey("users.id"), primary_key=True),
    db.Column("service_id", db.Integer, db.ForeignKey("services.id"), primary_key=True),
)


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    full_name = db.Column(db.String(150), nullable=False)
    phone = db.Column(db.String(20))
    role = db.Column(db.String(20), nullable=False)  # admin, stylist
    is_active = db.Column(db.Boolean, default=True)
    is_blacklisted = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    # Stylist-specific fields
    specialty = db.Column(db.String(200), nullable=True)
    experience_years = db.Column(db.Integer, nullable=True)
    bio = db.Column(db.Text, nullable=True)
    service_id = db.Column(db.Integer, db.ForeignKey("services.id"), nullable=True)
    photo_url = db.Column(db.String(500), nullable=True)

    appointments_as_stylist = db.relationship(
        "Appointment",
        foreign_keys="Appointment.stylist_id",
        backref="stylist",
        cascade="all,delete-orphan",
    )

    # Many-to-many: services this stylist can perform
    offered_services = db.relationship(
        "Service",
        secondary=stylist_services,
        backref="offering_stylists",
        lazy="select",
    )

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        data = {
            "id": self.id,
            "username": self.username,
            "email": self.email,
            "full_name": self.full_name,
            "phone": self.phone,
            "role": self.role,
            "is_active": self.is_active,
            "is_blacklisted": self.is_blacklisted,
        }
        if self.role == "stylist":
            data.update(
                {
                    "specialty": self.specialty,
                    "experience_years": self.experience_years,
                    "bio": self.bio,
                    "service_id": self.service_id,
                    "photo_url": self.photo_url,
                    "service_ids": [s.id for s in self.offered_services],
                    "services": [{"id": s.id, "name": s.name} for s in self.offered_services],
                }
            )
            if self.service_id:
                svc = Service.query.get(self.service_id)
                if svc:
                    data["service"] = {"id": svc.id, "name": svc.name}
        return data


class Service(db.Model):
    __tablename__ = "services"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(100), unique=True, nullable=False, index=True)
    description = db.Column(db.Text)
    price = db.Column(db.Float, default=0.0)
    duration_minutes = db.Column(db.Integer, default=30)
    is_active = db.Column(db.Boolean, default=True)

    stylists = db.relationship("User", backref="primary_service", foreign_keys=[User.service_id])

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "price": self.price,
            "duration_minutes": self.duration_minutes,
            "is_active": self.is_active,
        }


class Appointment(db.Model):
    __tablename__ = "appointments"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    stylist_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    service_id = db.Column(db.Integer, db.ForeignKey("services.id"), nullable=True)
    customer_name = db.Column(db.String(150), nullable=False)
    customer_phone = db.Column(db.String(20), nullable=False)
    customer_email = db.Column(db.String(120), nullable=True)
    appointment_date = db.Column(db.Date, nullable=False, index=True)
    appointment_time = db.Column(db.Time, nullable=False)
    status = db.Column(db.String(20), default="Booked")  # Booked, WalkIn, Completed, Cancelled
    reason = db.Column(db.Text)
    is_walkin = db.Column(db.Boolean, default=False)
    morning_reminder_sent_at = db.Column(db.DateTime, nullable=True)
    one_hour_reminder_sent_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    service = db.relationship("Service", backref="appointments")
    service_record = db.relationship(
        "ServiceRecord", backref="appointment", uselist=False, cascade="all,delete-orphan"
    )

    def to_dict(self, include_stylist=False, include_service_record=False):
        data = {
            "id": self.id,
            "stylist_id": self.stylist_id,
            "service_id": self.service_id,
            "customer_name": self.customer_name,
            "customer_phone": self.customer_phone,
            "customer_email": self.customer_email,
            "appointment_date": self.appointment_date.isoformat() if self.appointment_date else None,
            "appointment_time": self.appointment_time.isoformat() if self.appointment_time else None,
            "status": self.status,
            "reason": self.reason,
            "is_walkin": self.is_walkin,
        }
        if self.service:
            data["service"] = {
                "id": self.service.id,
                "name": self.service.name,
                "price": self.service.price,
                "duration_minutes": self.service.duration_minutes,
            }
        if include_stylist and self.stylist:
            data["stylist"] = {
                "id": self.stylist.id,
                "full_name": self.stylist.full_name,
                "specialty": self.stylist.specialty,
                "phone": self.stylist.phone,
            }
        if include_service_record and self.service_record:
            data["service_record"] = self.service_record.to_dict()
        return data


class ServiceRecord(db.Model):
    __tablename__ = "service_records"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    appointment_id = db.Column(db.Integer, db.ForeignKey("appointments.id"), nullable=False, unique=True)
    service_performed = db.Column(db.Text, nullable=False)
    notes = db.Column(db.Text)
    price_charged = db.Column(db.Float, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id,
            "appointment_id": self.appointment_id,
            "service_performed": self.service_performed,
            "notes": self.notes,
            "price_charged": self.price_charged,
        }


class SalonOperatingHours(db.Model):
    __tablename__ = "salon_operating_hours"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    day_of_week = db.Column(db.Integer, nullable=False, unique=True)  # 0=Mon … 6=Sun
    open_time = db.Column(db.Time, nullable=True)
    close_time = db.Column(db.Time, nullable=True)
    is_open = db.Column(db.Boolean, default=True)

    def to_dict(self):
        return {
            "id": self.id,
            "day_of_week": self.day_of_week,
            "open_time": self.open_time.isoformat() if self.open_time else None,
            "close_time": self.close_time.isoformat() if self.close_time else None,
            "is_open": self.is_open,
        }


class StylistAvailability(db.Model):
    __tablename__ = "stylist_availability"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    stylist_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    date = db.Column(db.Date, nullable=False, index=True)
    start_time = db.Column(db.Time, nullable=False)
    end_time = db.Column(db.Time, nullable=False)
    is_available = db.Column(db.Boolean, default=True)

    def to_dict(self):
        return {
            "id": self.id,
            "stylist_id": self.stylist_id,
            "date": self.date.isoformat() if self.date else None,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "is_available": self.is_available,
        }

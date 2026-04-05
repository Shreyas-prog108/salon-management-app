# Salon Management App

A full-stack web application for managing salon day-to-day operations — stylists, appointments, walk-ins, and business analytics.

**Live Demo:** https://your-domain.com
**Admin Login:** `admin` / `<set via DEFAULT_ADMIN_PASSWORD env var>`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, React, Tailwind CSS, Bootstrap Icons |
| Backend | Python 3.11, Flask, SQLAlchemy, Flask-JWT-Extended |
| Database | PostgreSQL 16 |
| Cache / Queue | Redis 7, Celery |
| Auth | JWT (access + refresh tokens, httpOnly cookies) |
| Notifications | Flask-Mail (email), Fast2SMS (SMS, India) |

---

## Features

### Salon Owner (Admin)
- Dashboard — today's bookings, revenue summary, stylist utilization
- **Sales Analytics** — revenue by day/week/month/all-time, stylist-wise, service-wise, walk-in vs appointment breakdown, 30-day trend chart
- Manage stylists — add/edit/deactivate, upload profile photos, assign multiple services, set login password
- Manage services — name, price, duration (in minutes)
- Set operating hours — per day of week, open/close times
- View and cancel all appointments
- Register walk-in customers on behalf of any stylist

### Stylist
- Personal schedule — filter by date and status
- Complete appointments — add service record (service performed, notes, price charged)
- Log walk-in customers instantly
- Manage availability slots (date, start time, end time)
- Update own profile (name, phone, specialty, bio, photo)
- Change own password

### Customer (Public — no login required)
- Browse available stylists with specialties and photos
- Check real-time availability by date and service
- Time slots generated in 30-min intervals, blocked by full service duration
- Book appointment — name, phone number (required), email (optional), service, stylist, time slot
- On-screen booking confirmation
- Look up existing appointments by phone number
- Booking confirmation email + 1-hour reminder (email + SMS)

### System
- Double-booking prevention with duration-aware conflict detection
- JWT access token auto-refresh (transparent to user)
- Redis caching for dashboard and analytics
- Security headers (X-Frame-Options, X-Content-Type-Options, etc.)

---

## Project Structure

```
salon-management-app-v2/
├── backend/
│   ├── app/
│   │   ├── routes/
│   │   │   ├── admin.py      # Admin API (stylists, services, appointments, analytics)
│   │   │   ├── auth.py       # Login, token refresh, change password
│   │   │   ├── booking.py    # Public booking API (no auth required)
│   │   │   └── stylist.py    # Stylist API (schedule, walk-in, availability, profile)
│   │   └── utils/
│   │       ├── decorators.py # role_required JWT decorator
│   │       ├── helpers.py    # Redis cache helpers
│   │       ├── email.py      # Flask-Mail wrappers
│   │       └── sms.py        # Fast2SMS wrapper
│   ├── config/config.py      # Environment-based configuration
│   ├── models.py             # SQLAlchemy models
│   ├── celery_app.py         # Celery + beat schedule
│   ├── celery_tasks.py       # Email/SMS notification tasks
│   ├── docker-compose.yml    # PostgreSQL + Redis (local dev)
│   ├── Procfile              # For PaaS deployment
│   ├── requirements.txt
│   └── start.py              # One-command local startup
├── frontend/
│   ├── app/
│   │   ├── book/             # Public booking page (no login)
│   │   ├── admin/
│   │   │   ├── dashboard/
│   │   │   ├── analytics/    # Sales analytics dashboard
│   │   │   ├── stylists/
│   │   │   ├── services/
│   │   │   ├── appointments/
│   │   │   └── operating-hours/
│   │   ├── stylist/
│   │   │   ├── appointments/
│   │   │   ├── walkin/
│   │   │   ├── availability/
│   │   │   └── profile/
│   │   ├── login/
│   │   └── api/[...path]/    # Next.js proxy to Flask (handles auth cookies)
│   ├── components/common/    # Layout, Navbar, Sidebar, Dialogs
│   ├── context/UIContext.jsx
│   └── services/api.js       # API client
└── deploy/
    ├── ec2_setup.sh          # EC2 Ubuntu one-command setup
    └── update.sh             # Pull + restart on EC2
```

---

## Data Models

| Model | Purpose |
|---|---|
| `User` | Admin and stylist accounts (role-based) |
| `Service` | Salon services with price and duration |
| `stylist_services` | Many-to-many: which services a stylist offers |
| `Appointment` | Bookings and walk-ins |
| `ServiceRecord` | Post-completion record (service done, notes, price charged) |
| `StylistAvailability` | Available time windows per stylist per date |
| `SalonOperatingHours` | Per-day open/close times for the salon |

---

## Local Development

### Prerequisites
- Python 3.11+
- Node.js 18+
- Docker Desktop (for PostgreSQL + Redis)

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env — set SECRET_KEY, JWT_SECRET_KEY, mail settings
python start.py               # starts Docker + Flask + Celery
```

`start.py` automatically:
1. Launches Docker Desktop if not running
2. Starts PostgreSQL (port 5432) and Redis (port 6380) containers
3. Waits for both to be healthy
4. Starts Flask on port 5000
5. Starts Celery worker and beat scheduler

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local   # or create manually
# FLASK_URL=http://localhost:5000
npm run dev
```

Frontend runs at **http://localhost:3000**

---

## Default Credentials

| Role | Username | Password |
|---|---|---|
| Admin | `admin` | Set via `DEFAULT_ADMIN_PASSWORD` env var |

If `DEFAULT_ADMIN_PASSWORD` is not set, a random 16-character password is auto-generated and printed to the console on first run. Stylists are created by the admin — no public registration.

---

## API Overview

### Public (no auth)
```
GET  /api/booking/services
GET  /api/booking/stylists
GET  /api/booking/stylists/:id/availability?date=YYYY-MM-DD&service_id=
POST /api/booking/appointments
POST /api/booking/walkin
GET  /api/booking/appointments/lookup?phone=
```

### Admin (JWT required, role=admin)
```
GET             /api/admin/dashboard
GET             /api/admin/analytics?period=today|week|month|all
GET/POST        /api/admin/services
PUT             /api/admin/services/:id
GET/POST        /api/admin/stylists
GET/PUT/DELETE  /api/admin/stylists/:id
POST            /api/admin/stylists/:id/photo
GET/PUT         /api/admin/operating-hours
GET             /api/admin/appointments
POST            /api/admin/appointments/:id/cancel
```

### Stylist (JWT required, role=stylist)
```
GET             /api/stylist/appointments
PUT             /api/stylist/appointments/:id/status
POST            /api/stylist/appointments/:id/service-record
GET/POST        /api/stylist/availability
DELETE          /api/stylist/availability/:id
GET/PUT         /api/stylist/profile
POST            /api/stylist/profile/photo
```

---

## Deployment

### Backend → EC2 (Ubuntu 22.04)

```bash
bash deploy/ec2_setup.sh
# Edit /opt/salon/backend/.env
sudo systemctl start salon-web salon-celery salon-beat
```

### Frontend → Vercel

Set environment variable:
```
FLASK_URL=https://<your-ec2-domain-or-ip>
```

---

## Stopping Services (Local)

```bash
# Stop Flask + Celery — Ctrl+C in start.py terminal

# Stop Docker containers
cd backend && docker compose down

# Wipe database
docker compose down -v
```

# Salon Management App — Testing Guide

Start the app locally before testing:
```bash
cd backend && python start.py   # terminal 1
cd frontend && npm run dev       # terminal 2
```

Open **http://localhost:3000**

---

## 1. Public Booking Flow (No Login)

**URL:** http://localhost:3000/book

- [ ] Page loads with list of services
- [ ] Selecting a service shows available stylists
- [ ] Selecting a stylist + date loads available 30-min time slots
- [ ] Past time slots for today are not shown
- [ ] Slots blocked by existing bookings don't appear
- [ ] Service duration is respected — e.g., 60-min service blocks 2 consecutive slots
- [ ] Book with: name, 10-digit phone, optional email, service, stylist, slot
- [ ] Booking confirmation shown on screen with booking ID
- [ ] Invalid phone (non-10-digit) shows validation error
- [ ] Double booking the same slot returns "already booked" error
- [ ] Walk-in without email works fine

---

## 2. Admin Panel

**Login:** http://localhost:3000/login
**Credentials:** `admin` / `<your DEFAULT_ADMIN_PASSWORD>`

### Dashboard
- [ ] Today's appointments count is correct
- [ ] Revenue summary shows total from completed service records
- [ ] Stylist utilization shows completed appointments this month per stylist

### Analytics (`/admin/analytics`)
- [ ] Period tabs: Today / This Week / This Month / All Time
- [ ] Switching period updates **all** sections (KPI cards + By Stylist + By Service)
- [ ] Revenue in KPI card matches sum of revenue in By Service table
- [ ] Total appointments in KPI card matches total in By Stylist table
- [ ] Daily trend chart shows bars for days with appointments
- [ ] Walk-in count and Booking count add up to Total

### Stylists (`/admin/stylists`)
- [ ] Add stylist with name, email, phone, specialty, password
- [ ] Assign multiple services using checkboxes
- [ ] "Select All" button selects all services
- [ ] "Clear" button deselects all
- [ ] Service count badge updates ("3 service(s) selected")
- [ ] Edit stylist — change name, specialty, services
- [ ] Reset password field in edit modal (leave blank = keep current)
- [ ] Upload profile photo
- [ ] Deactivate stylist — they no longer appear on booking page

### Services (`/admin/services`)
- [ ] Add service with name, price, duration (minutes)
- [ ] Edit service
- [ ] Deactivate service — no longer shown on booking page

### Appointments (`/admin/appointments`)
- [ ] All appointments listed with filters (date, status, stylist)
- [ ] Cancel a booked appointment — status changes to Cancelled

### Operating Hours (`/admin/operating-hours`)
- [ ] Toggle days on/off
- [ ] Set open and close times per day
- [ ] Save — changes persist on refresh

---

## 3. Stylist Portal

**Login:** Use a stylist account created by admin

### Appointments (`/stylist/appointments`)
- [ ] Only this stylist's appointments shown
- [ ] Filter by date and status works
- [ ] "Complete Appointment" button opens modal
- [ ] Filling service performed + price + notes and submitting marks appointment Completed
- [ ] Completed appointment shows service record details
- [ ] Cannot complete an already-completed or cancelled appointment

### Walk-in (`/stylist/walkin`)
- [ ] Enter customer name + phone → registers walk-in immediately
- [ ] Walk-in appears in appointments list with status "WalkIn"

### Availability (`/stylist/availability`)
- [ ] Add availability slot: date, start time, end time
- [ ] End time must be after start time (validated)
- [ ] Slot appears in list after adding
- [ ] Delete slot — removed from list
- [ ] Added slot shows as available on booking page for that date

### Profile (`/stylist/profile`)
- [ ] Edit name, phone, specialty, bio
- [ ] Upload profile photo — appears on booking page
- [ ] Change password — new password works on next login

---

## 4. Booking Conflict Prevention

Test double-booking prevention:

1. Admin creates stylist with availability 9:00–12:00 on today's date
2. Customer books 10:00 AM for a 60-min service
3. Open booking page again for same stylist + date
4. Verify: 10:00 and 10:30 slots are gone (full 60-min duration blocked)
5. 9:00, 9:30, 11:00, 11:30 still available

---

## 5. Email Notifications (requires mail config in .env)

- [ ] Book an appointment with a valid email → confirmation email arrives
- [ ] 1 hour before appointment time → reminder email arrives (requires Celery beat running)

To test email immediately without waiting:
```bash
cd backend
source venv/bin/activate
python -c "
from app import create_app
from celery_tasks import send_appointment_booking_confirmation
app = create_app()
with app.app_context():
    send_appointment_booking_confirmation(1)   # use a real appointment ID
"
```

---

## 6. SMS Notifications (requires Fast2SMS API key + ₹100 recharge)

- [ ] Book appointment with a 10-digit Indian mobile number
- [ ] Customer receives SMS confirmation
- [ ] 1 hour before → reminder SMS

---

## 7. Token Refresh (Auth)

- Access token expires in 15 minutes
- Refresh token lasts 30 days
- [ ] Stay logged in for 15+ minutes → requests still work (token auto-refreshed silently)
- [ ] Clear cookies manually → redirected to login page

---

## 8. Security Checks

- [ ] Visiting `/admin/dashboard` without login → redirected to `/login`
- [ ] Stylist cannot access `/admin/*` routes (403)
- [ ] Admin cannot access `/stylist/*` routes (403)
- [ ] Uploading a `.exe` or `.php` file as profile photo → rejected
- [ ] Booking with a phone number that's not 10 digits → validation error
- [ ] Booking with invalid email format → validation error

---

## Quick Checklist

```
Public:
  [ ] Browse services and stylists
  [ ] Check availability slots (30-min intervals, duration-aware)
  [ ] Book appointment
  [ ] Look up appointment by phone

Admin:
  [ ] Dashboard loads
  [ ] Analytics period filter works consistently
  [ ] Create stylist with services and password
  [ ] Edit stylist / reset password
  [ ] Cancel appointment

Stylist:
  [ ] View own schedule
  [ ] Complete appointment + add service record
  [ ] Register walk-in
  [ ] Set availability
  [ ] Update profile + change password
```

import csv
import os
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import requests

from app import create_app, db
from app.utils.email import (
    create_appointment_confirmation_email,
    create_appointment_reminder_email,
    create_stylist_appointment_reminder_email,
    create_stylist_appointment_notification_email,
    create_monthly_report_email,
    send_email,
)
from app.utils.sms import send_sms
from celery_app import celery_app
from models import Appointment, User


flask_app = create_app()


def _now_local():
    tz_name = flask_app.config.get("SALON_TIMEZONE", "Asia/Kolkata")
    return datetime.now(ZoneInfo(tz_name))


@celery_app.task(name="celery_tasks.send_appointment_booking_confirmation")
def send_appointment_booking_confirmation(appointment_id):
    with flask_app.app_context():
        appointment = Appointment.query.get(appointment_id)
        if not appointment:
            return f"Appointment {appointment_id} not found"

        stylist = User.query.get(appointment.stylist_id)
        if not stylist:
            return f"Incomplete appointment data for appointment {appointment_id}"

        appointment_date = appointment.appointment_date.strftime("%B %d, %Y")
        appointment_time = appointment.appointment_time.strftime("%I:%M %p")
        service_name = appointment.service.name if appointment.service else "General Service"
        log_file = os.path.join("logs", "booking_notifications.log")
        os.makedirs(os.path.dirname(log_file), exist_ok=True)
        notifications = []

        if appointment.customer_email:
            customer_text_body, customer_html_body = create_appointment_confirmation_email(
                client_name=appointment.customer_name,
                stylist_name=stylist.full_name,
                service_type=service_name,
                appointment_date=appointment_date,
                appointment_time=appointment_time,
            )
            customer_result = send_email(
                subject="Appointment Confirmed - Baalbar",
                recipients=appointment.customer_email,
                text_body=customer_text_body,
                html_body=customer_html_body,
            )
            notifications.append(("customer", appointment.customer_email, customer_result))

        if stylist.email:
            stylist_text_body, stylist_html_body = create_stylist_appointment_notification_email(
                stylist_name=stylist.full_name,
                client_name=appointment.customer_name,
                appointment_date=appointment_date,
                appointment_time=appointment_time,
                service=service_name,
            )
            stylist_result = send_email(
                subject="New Appointment Booked - Salon Management System",
                recipients=stylist.email,
                text_body=stylist_text_body,
                html_body=stylist_html_body,
            )
            notifications.append(("stylist", stylist.email, stylist_result))

        # SMS confirmation to customer
        if appointment.customer_phone:
            sms_body = (
                f"Hi {appointment.customer_name}, your appointment is confirmed!\n"
                f"Service: {service_name}\n"
                f"Stylist: {stylist.full_name}\n"
                f"Date: {appointment_date} at {appointment_time}\n"
                f"- Baalbar Salon"
            )
            sms_result = send_sms(appointment.customer_phone, sms_body)
            notifications.append(("customer_sms", appointment.customer_phone, sms_result))

        with open(log_file, "a") as f:
            for recipient_type, recipient_email, result in notifications:
                status = "SENT" if result["success"] else "FAILED"
                f.write(
                    f"{datetime.now().isoformat()} - [{status}] "
                    f"Appointment {appointment.id} - {recipient_type} - "
                    f"{recipient_email} - {result['message']}\n"
                )

        success_messages = []
        failed_messages = []
        for recipient_type, recipient_email, result in notifications:
            label = f"{recipient_type} {recipient_email}"
            if result["success"]:
                print(f"✓ Booking notification email sent to {label}")
                success_messages.append(label)
            else:
                print(f"✗ Booking notification email failed for {label}: {result['message']}")
                failed_messages.append(f"{label}: {result['message']}")

        if not notifications:
            return f"No email recipients configured for appointment {appointment_id}"

        parts = []
        if success_messages:
            parts.append(f"Sent to {', '.join(success_messages)}")
        if failed_messages:
            parts.append(f"Failed for {', '.join(failed_messages)}")
        return "; ".join(parts)



@celery_app.task(name="celery_tasks.send_one_hour_appointment_reminders")
def send_one_hour_appointment_reminders():
    with flask_app.app_context():
        now = _now_local()
        one_hour_later = now + timedelta(hours=1)
        target_date = one_hour_later.date()
        appointments = Appointment.query.filter_by(appointment_date=target_date, status="Booked").all()
        sent_count = 0

        for appointment in appointments:
            if appointment.one_hour_reminder_sent_at:
                continue

            appt_dt = datetime.combine(appointment.appointment_date, appointment.appointment_time, tzinfo=now.tzinfo)
            diff_seconds = (appt_dt - now).total_seconds()
            if diff_seconds < 0 or diff_seconds > 3600:
                continue

            stylist = User.query.get(appointment.stylist_id)
            service_name = appointment.service.name if appointment.service else "General Service"
            appointment_date = appointment.appointment_date.strftime("%B %d, %Y")
            appointment_time = appointment.appointment_time.strftime("%I:%M %p")

            delivered = False

            if appointment.customer_email:
                customer_text_body, customer_html_body = create_appointment_reminder_email(
                    client_name=appointment.customer_name,
                    stylist_name=stylist.full_name if stylist else "Your Stylist",
                    service_type=service_name,
                    appointment_date=appointment_date,
                    appointment_time=appointment_time,
                )
                result = send_email(
                    subject="Reminder: Your appointment starts in about 1 hour",
                    recipients=appointment.customer_email,
                    text_body=customer_text_body,
                    html_body=customer_html_body,
                )
                delivered = delivered or result["success"]

            if stylist and stylist.email:
                stylist_text_body, stylist_html_body = create_stylist_appointment_reminder_email(
                    stylist_name=stylist.full_name,
                    client_name=appointment.customer_name,
                    service_type=service_name,
                    appointment_date=appointment_date,
                    appointment_time=appointment_time,
                    reminder_label="1-hour",
                )
                result = send_email(
                    subject="Reminder: Appointment in about 1 hour",
                    recipients=stylist.email,
                    text_body=stylist_text_body,
                    html_body=stylist_html_body,
                )
                delivered = delivered or result["success"]

            # SMS reminder to customer
            if appointment.customer_phone:
                sms_body = (
                    f"Reminder: Your appointment is in 1 hour!\n"
                    f"Service: {service_name}\n"
                    f"Stylist: {stylist.full_name if stylist else 'Your Stylist'}\n"
                    f"Time: {appointment_time}\n"
                    f"- Baalbar Salon"
                )
                sms_result = send_sms(appointment.customer_phone, sms_body)
                delivered = delivered or sms_result["success"]

            if delivered:
                appointment.one_hour_reminder_sent_at = now
                sent_count += 1

        db_changed = any(a.one_hour_reminder_sent_at for a in appointments)
        if db_changed:
            db.session.commit()

        return f"Sent one-hour reminders for {sent_count} appointments"


@celery_app.task(name="celery_tasks.send_daily_appointment_reminders")
def send_daily_appointment_reminders():
    with flask_app.app_context():
        today = date.today()
        appointments = Appointment.query.filter_by(
            appointment_date=today,
            status="Booked",
        ).all()

        sent_count = 0
        failed_count = 0
        webhook_url = os.getenv("GOOGLE_CHAT_WEBHOOK_URL")

        for appointment in appointments:
            stylist = User.query.get(appointment.stylist_id)
            service_name = appointment.service.name if appointment.service else "General Service"
            email_sent = False

            # Note: Customer email not in current model, sending to stylist only
            # Future: add customer_email field to Appointment model

            if webhook_url:
                try:
                    webhook_message = (
                        f"Appointment reminder: {appointment.customer_name} "
                        f"with {stylist.full_name} on "
                        f"{appointment.appointment_date.strftime('%B %d, %Y')} at "
                        f"{appointment.appointment_time.strftime('%I:%M %p')} "
                        f"for {service_name}."
                    )
                    payload = {"text": webhook_message}
                    response = requests.post(webhook_url, json=payload, timeout=10)
                    if response.status_code == 200:
                        print(f"Webhook notification sent for {appointment.customer_name}")
                        sent_count += 1
                        email_sent = True
                except Exception as e:
                    print(f"Webhook error: {e}")

            try:
                log_file = os.path.join("logs", "reminders.log")
                os.makedirs(os.path.dirname(log_file), exist_ok=True)
                with open(log_file, "a") as f:
                    status = "SENT" if email_sent else "FAILED"
                    f.write(
                        f"\n{datetime.now().isoformat()} - [{status}] "
                        f"Reminder for {appointment.customer_name} ({appointment.customer_phone})\n"
                    )
            except Exception as e:
                print(f"✗ Log error: {e}")

            if not email_sent:
                failed_count += 1

        result_message = f"Sent {sent_count} email reminders for {today}"
        if failed_count > 0:
            result_message += f" ({failed_count} failed)"
        return result_message


@celery_app.task(name="celery_tasks.send_monthly_stylist_reports")
def send_monthly_stylist_reports():
    with flask_app.app_context():
        today = date.today()
        first_day_this_month = today.replace(day=1)
        last_day_prev_month = first_day_this_month - timedelta(days=1)
        first_day_prev_month = last_day_prev_month.replace(day=1)

        stylists = User.query.filter_by(role="stylist", is_active=True, is_blacklisted=False).all()
        reports_sent = 0

        for stylist in stylists:
            appointments = Appointment.query.filter(
                Appointment.stylist_id == stylist.id,
                Appointment.appointment_date >= first_day_prev_month,
                Appointment.appointment_date <= last_day_prev_month,
            ).all()
            if not appointments:
                continue

            html_report = generate_monthly_report_html(
                stylist,
                appointments,
                first_day_prev_month,
                last_day_prev_month,
            )
            reports_dir = os.path.join("exports", "reports")
            os.makedirs(reports_dir, exist_ok=True)
            filename = f"stylist_{stylist.id}_report_{last_day_prev_month.strftime('%Y_%m')}.html"
            filepath = os.path.join(reports_dir, filename)
            with open(filepath, "w") as f:
                f.write(html_report)

            if stylist.email:
                try:
                    month_year = first_day_prev_month.strftime("%B %Y")
                    text_body, html_body = create_monthly_report_email(
                        stylist_name=stylist.full_name,
                        month_year=month_year,
                    )
                    result = send_email(
                        subject=f"Monthly Activity Report - {month_year}",
                        recipients=stylist.email,
                        text_body=text_body,
                        html_body=html_body,
                    )
                    if result["success"]:
                        print(f"✓ Email sent to {stylist.full_name} ({stylist.email})")
                    else:
                        print(
                            f"✗ Failed to send email to {stylist.full_name}: "
                            f"{result['message']}"
                        )
                except Exception as e:
                    print(f"✗ Email error for {stylist.full_name}: {e}")

            log_file = os.path.join("logs", "monthly_reports.log")
            os.makedirs(os.path.dirname(log_file), exist_ok=True)
            with open(log_file, "a") as f:
                f.write(
                    f"{datetime.now().isoformat()} - Report generated for "
                    f"{stylist.full_name}: {filepath}\n"
                )

            reports_sent += 1

        return f"Generated and emailed {reports_sent} monthly reports for stylists"


def generate_monthly_report_html(stylist, appointments, start_date, end_date):
    total_appointments = len(appointments)
    completed = len([a for a in appointments if a.status == "Completed"])
    cancelled = len([a for a in appointments if a.status == "Cancelled"])
    booked = len([a for a in appointments if a.status == "Booked"])
    walkin = len([a for a in appointments if a.is_walkin])

    html = f"""
<html>
<head>
    <title>Monthly Activity Report</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 24px; color: #222; }}
        h1, h2 {{ margin-bottom: 8px; }}
        table {{ border-collapse: collapse; width: 100%; margin-top: 16px; }}
        th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
        th {{ background-color: #f5f5f5; }}
        .summary {{ margin: 16px 0; }}
    </style>
</head>
<body>
    <h1>Monthly Activity Report</h1>
    <p><strong>Stylist:</strong> {stylist.full_name}</p>
    <p><strong>Specialty:</strong> {stylist.specialty or 'N/A'}</p>
    <p><strong>Reporting Period:</strong> {start_date.strftime('%B %d, %Y')} to {end_date.strftime('%B %d, %Y')}</p>

    <div class="summary">
        <h2>Summary</h2>
        <p><strong>Total Appointments:</strong> {total_appointments}</p>
        <p><strong>Completed:</strong> {completed}</p>
        <p><strong>Cancelled:</strong> {cancelled}</p>
        <p><strong>Booked:</strong> {booked}</p>
        <p><strong>Walk-ins:</strong> {walkin}</p>
    </div>

    <h2>Appointment Details</h2>
    <table>
        <thead>
            <tr>
                <th>Date</th>
                <th>Time</th>
                <th>Customer</th>
                <th>Phone</th>
                <th>Service</th>
                <th>Status</th>
            </tr>
        </thead>
        <tbody>
"""

    for apt in appointments:
        service_name = apt.service.name if apt.service else "N/A"
        html += f"""
            <tr>
                <td>{apt.appointment_date.strftime('%Y-%m-%d')}</td>
                <td>{apt.appointment_time.strftime('%H:%M')}</td>
                <td>{apt.customer_name}</td>
                <td>{apt.customer_phone}</td>
                <td>{service_name}</td>
                <td>{apt.status}</td>
            </tr>
"""

    html += """
        </tbody>
    </table>
</body>
</html>
"""

    return html


@celery_app.task(name="celery_tasks.export_customer_service_csv")
def export_customer_service_csv(customer_name, customer_phone):
    with flask_app.app_context():
        appointments = Appointment.query.filter_by(
            customer_name=customer_name,
            customer_phone=customer_phone,
            status="Completed",
        ).order_by(Appointment.appointment_date.desc()).all()

        exports_dir = os.path.join("exports")
        os.makedirs(exports_dir, exist_ok=True)
        safe_name = customer_name.replace(" ", "_")
        filename = f"customer_{safe_name}_service_history_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        filepath = os.path.join(exports_dir, filename)

        with open(filepath, "w", newline="") as csvfile:
            fieldnames = [
                "Customer Name",
                "Customer Phone",
                "Stylist Name",
                "Stylist Specialty",
                "Appointment Date",
                "Appointment Time",
                "Service",
                "Status",
                "Walk-in",
            ]
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            writer.writeheader()

            for apt in appointments:
                stylist = User.query.get(apt.stylist_id)
                writer.writerow(
                    {
                        "Customer Name": apt.customer_name,
                        "Customer Phone": apt.customer_phone,
                        "Stylist Name": stylist.full_name if stylist else "N/A",
                        "Stylist Specialty": stylist.specialty if stylist and stylist.specialty else "N/A",
                        "Appointment Date": apt.appointment_date.strftime("%Y-%m-%d"),
                        "Appointment Time": apt.appointment_time.strftime("%H:%M"),
                        "Service": apt.service.name if apt.service else "N/A",
                        "Status": apt.status,
                        "Walk-in": "Yes" if apt.is_walkin else "No",
                    }
                )

        return {
            "status": "success",
            "filename": filename,
            "filepath": filepath,
            "records": len(appointments),
        }

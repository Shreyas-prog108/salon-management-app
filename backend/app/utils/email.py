from flask import current_app
from flask_mail import Message

from app import mail


def send_email(subject, recipients, text_body, html_body=None, sender=None):
    try:
        if isinstance(recipients, str):
            recipients = [recipients]
        if sender is None:
            sender = current_app.config.get("MAIL_USERNAME")
        if not sender:
            return {
                "success": False,
                "message": "Email not configured. Please set MAIL_USERNAME in environment variables.",
            }
        msg = Message(subject=subject, sender=sender, recipients=recipients)
        msg.body = text_body
        if html_body:
            msg.html = html_body
        mail.send(msg)
        return {"success": True, "message": f"Email sent to {', '.join(recipients)}"}
    except Exception as e:
        return {"success": False, "message": f"Failed to send email: {str(e)}"}


def create_appointment_reminder_email(
    client_name, stylist_name, service_type, appointment_date, appointment_time
):
    text_body = f"""
Dear {client_name},

This is a reminder for your appointment at our salon.

Stylist: {stylist_name}
Service: {service_type}
Date: {appointment_date}
Time: {appointment_time}

We look forward to seeing you!
""".strip()

    html_body = f"""
<html>
<body>
    <p>Dear {client_name},</p>
    <p>This is a reminder for your appointment at our salon.</p>
    <ul>
        <li><strong>Stylist:</strong> {stylist_name}</li>
        <li><strong>Service:</strong> {service_type}</li>
        <li><strong>Date:</strong> {appointment_date}</li>
        <li><strong>Time:</strong> {appointment_time}</li>
    </ul>
    <p>We look forward to seeing you!</p>
</body>
</html>
""".strip()

    return text_body, html_body


def create_stylist_appointment_reminder_email(
    stylist_name,
    client_name,
    service_type,
    appointment_date,
    appointment_time,
    reminder_label="Upcoming",
):
    text_body = f"""
Dear {stylist_name},

{reminder_label} appointment reminder.

Client: {client_name}
Service: {service_type}
Date: {appointment_date}
Time: {appointment_time}

Please be ready for this appointment.
""".strip()

    html_body = f"""
<html>
<body>
    <p>Dear {stylist_name},</p>
    <p><strong>{reminder_label}</strong> appointment reminder.</p>
    <ul>
        <li><strong>Client:</strong> {client_name}</li>
        <li><strong>Service:</strong> {service_type}</li>
        <li><strong>Date:</strong> {appointment_date}</li>
        <li><strong>Time:</strong> {appointment_time}</li>
    </ul>
    <p>Please be ready for this appointment.</p>
</body>
</html>
""".strip()

    return text_body, html_body


def create_appointment_confirmation_email(
    client_name, stylist_name, service_type, appointment_date, appointment_time
):
    text_body = f"""
Dear {client_name},

Your appointment has been booked successfully!

Stylist: {stylist_name}
Service: {service_type}
Date: {appointment_date}
Time: {appointment_time}

Please keep this email for your reference.
""".strip()

    html_body = f"""
<html>
<body>
    <p>Dear {client_name},</p>
    <p>Your appointment has been booked successfully!</p>
    <ul>
        <li><strong>Stylist:</strong> {stylist_name}</li>
        <li><strong>Service:</strong> {service_type}</li>
        <li><strong>Date:</strong> {appointment_date}</li>
        <li><strong>Time:</strong> {appointment_time}</li>
    </ul>
    <p>Please keep this email for your reference.</p>
</body>
</html>
""".strip()

    return text_body, html_body


def create_stylist_appointment_notification_email(
    stylist_name, client_name, appointment_date, appointment_time, service=None
):
    text_body = f"""
Dear {stylist_name},

A new appointment has been booked with you.

Client: {client_name}
Date: {appointment_date}
Time: {appointment_time}
Service: {service or 'N/A'}

Please log in to the Salon Management System to review the appointment details.
""".strip()

    html_body = f"""
<html>
<body>
    <p>Dear {stylist_name},</p>
    <p>A new appointment has been booked with you.</p>
    <ul>
        <li><strong>Client:</strong> {client_name}</li>
        <li><strong>Date:</strong> {appointment_date}</li>
        <li><strong>Time:</strong> {appointment_time}</li>
        <li><strong>Service:</strong> {service or 'N/A'}</li>
    </ul>
    <p>Please log in to the Salon Management System to review the appointment details.</p>
</body>
</html>
""".strip()

    return text_body, html_body


def create_monthly_report_email(stylist_name, month_year):
    text_body = f"""
Dear {stylist_name},

Your monthly activity report for {month_year} has been generated successfully.

Please log in to the Salon Management System to review the latest details.
""".strip()

    html_body = f"""
<html>
<body>
    <p>Dear {stylist_name},</p>
    <p>Your monthly activity report for <strong>{month_year}</strong> has been generated successfully.</p>
    <p>Please log in to the Salon Management System to review the latest details.</p>
</body>
</html>
""".strip()

    return text_body, html_body

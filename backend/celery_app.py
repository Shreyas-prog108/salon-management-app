import os

from celery import Celery
from celery.schedules import crontab
from dotenv import load_dotenv

from config.config import Config


load_dotenv()

default_redis_url = (
    f"redis://{os.getenv('APP_REDIS_HOST', '127.0.0.1')}:"
    f"{os.getenv('APP_REDIS_PORT', '6380')}/"
    f"{os.getenv('APP_REDIS_DB', '0')}"
)

celery_app = Celery(
    "salon_management",
    broker=os.getenv("CELERY_BROKER_URL", default_redis_url),
    backend=os.getenv("CELERY_RESULT_BACKEND", default_redis_url),
    include=["celery_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone=Config.SALON_TIMEZONE,
    enable_utc=False,
    task_track_started=True,
    task_time_limit=30 * 60,
    result_expires=3600,
    broker_connection_retry_on_startup=True,
)

celery_app.conf.beat_schedule = {
    "send-one-hour-reminders": {
        "task": "celery_tasks.send_one_hour_appointment_reminders",
        "schedule": crontab(minute="*/5"),
    },
    "send-monthly-reports": {
        "task": "celery_tasks.send_monthly_stylist_reports",
        "schedule": crontab(hour=4, minute=0, day_of_month=1),
    },
}


if __name__ == "__main__":
    celery_app.start()

import os
from pathlib import Path

from celery import Celery
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")
app = Celery("perpetual_pos")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

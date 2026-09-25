from celery import Celery

from environment import configure_settings

configure_settings()
app = Celery("duukayo")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

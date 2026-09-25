import sys

from django.core.management import execute_from_command_line

from environment import configure_settings

configure_settings("development")
execute_from_command_line(sys.argv)

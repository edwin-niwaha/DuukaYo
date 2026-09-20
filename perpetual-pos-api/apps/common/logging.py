import json
import logging
import re


class JsonFormatter(logging.Formatter):
    def format(self, record):
        return json.dumps(
            {
                "level": record.levelname,
                "logger": record.name,
                "message": re.sub(
                    r"(guest-orders/)[^/\s]+", r"\1[redacted]", record.getMessage()
                ),
                "time": self.formatTime(record),
            }
        )

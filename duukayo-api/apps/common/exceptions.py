from django.core.exceptions import ValidationError as ModelValidationError
from rest_framework.exceptions import ValidationError
from rest_framework.views import exception_handler as default_handler


def exception_handler(exc, context):
    if isinstance(exc, ModelValidationError):
        exc = ValidationError(exc.message_dict if hasattr(exc, "message_dict") else exc.messages)
    response = default_handler(exc, context)
    if response is not None:
        codes = {400: "validation_error", 401: "authentication_required",
                 403: "permission_denied", 404: "not_found", 429: "rate_limited"}
        code = codes.get(response.status_code, "request_failed")
        if isinstance(response.data, dict):
            response.data["code"] = code
        else:
            response.data = {"detail": response.data, "code": code}
    return response

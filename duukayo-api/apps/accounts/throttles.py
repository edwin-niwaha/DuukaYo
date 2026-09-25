from rest_framework.throttling import AnonRateThrottle


class LoginThrottle(AnonRateThrottle):
    scope = "credential_login"
    rate = "30/min"

    def allow_request(self, request, view):
        if request.method != "POST":
            return True
        return super().allow_request(request, view)

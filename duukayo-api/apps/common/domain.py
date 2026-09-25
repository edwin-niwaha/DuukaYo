import hashlib
import json

from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied

from apps.businesses.models import Business, Membership
from apps.common.models import Audit


def fingerprint(data):
    return hashlib.sha256(
        json.dumps(data, sort_keys=True, default=str, separators=(",", ":")).encode()
    ).hexdigest()


def membership(user, business_id, roles=None):
    m = get_object_or_404(
        Membership.objects.select_related("business", "branch"),
        user=user,
        business_id=business_id,
        active=True,
        user__is_active=True,
        role__in=[role for role, _ in Membership.ROLES],
    )
    if m.branch.business_id != m.business_id:
        raise PermissionDenied("Membership branch is outside this business.")
    if m.business.deleted_at:
        raise PermissionDenied("This shop has been deleted.")
    if m.business.suspended:
        raise PermissionDenied("This shop is suspended. Contact platform support.")
    if roles and m.role not in roles:
        raise PermissionDenied("Your role cannot perform this operation.")
    return m


def audit(business, actor, action, reference, detail=None):
    Audit.objects.create(
        business=business,
        actor=actor,
        action=action,
        reference=str(reference),
        detail=detail or {},
    )


def lock_business(business):
    current = Business.objects.select_for_update().get(pk=business.pk)
    if current.deleted_at:
        raise PermissionDenied("This shop has been deleted.")
    return current

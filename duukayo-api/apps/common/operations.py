from rest_framework.exceptions import ValidationError

from apps.common.domain import fingerprint
from apps.common.models import Operation


def replay(m, kind, data):
    # Caller must hold the business lock throughout replay + effect + record.
    op = Operation.objects.filter(
        business=m.business, kind=kind, client_id=data["client_id"]
    ).first()
    if op and (
        op.branch_id != m.branch_id
        or op.actor_id != m.user_id
        or op.payload_hash != fingerprint(data)
    ):
        raise ValidationError(
            "Operation key was already used for different data, actor or branch."
        )
    return op.result if op else None


def record(m, kind, data, result):
    Operation.objects.create(
        business=m.business,
        branch=m.branch,
        actor=m.user,
        kind=kind,
        client_id=data["client_id"],
        payload_hash=fingerprint(data),
        result=result,
    )
    return result

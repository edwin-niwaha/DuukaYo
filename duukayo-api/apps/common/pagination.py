from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class OptionalPagination(PageNumberPagination):
    """Opt-in envelope while v1 clients that expect arrays remain compatible."""

    page_size = 100
    page_size_query_param = "page_size"
    max_page_size = 200

    def paginate_queryset(self, queryset, request, view=None):
        if "page" not in request.query_params:
            return None
        return super().paginate_queryset(queryset, request, view)


def collection_response(queryset, request, serializer=None, legacy_limit=None):
    pager = OptionalPagination()
    page = pager.paginate_queryset(queryset, request)
    rows = (
        page
        if page is not None
        else queryset[:legacy_limit]
        if legacy_limit
        else queryset
    )
    data = serializer(rows, many=True).data if serializer else list(rows)
    return pager.get_paginated_response(data) if page is not None else Response(data)

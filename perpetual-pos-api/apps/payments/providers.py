from typing import Protocol


class MerchantPaymentProvider(Protocol):
    def request_payment(
        self, *, merchant_id: str, amount: int, currency: str, reference: str
    ) -> str: ...
    def verify(self, *, merchant_id: str, reference: str) -> bool: ...


class UnconfiguredProvider:
    def request_payment(self, **kwargs):
        raise NotImplementedError(
            "Live payments are not configured. Use explicit manual records."
        )

    def verify(self, **kwargs):
        return False

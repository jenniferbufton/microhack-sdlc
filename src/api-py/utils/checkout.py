from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

from models.checkout import CheckoutRequest
from utils.errors import ApiException, ValidationException


def require_mock_provider() -> None:
    if (
        os.getenv("PAYMENT_PROVIDER") != "mock"
        or os.getenv("PAYMENT_MOCK_ENABLED") != "true"
        or os.getenv("PAYMENT_CURRENCY") != "USD"
    ):
        raise ApiException(
            "Demo checkout is unavailable. Configure and enable the mock USD provider.",
            "PAYMENT_UNAVAILABLE",
            503,
        )


def request_fingerprint(request: CheckoutRequest) -> str:
    payload = request.model_dump(mode="json", exclude={"requestKey", "discountCode"})
    if request.discountCode is not None:
        payload["discountCode"] = request.discountCode
    payload["items"] = sorted(payload["items"], key=lambda item: item["productId"])
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


def discounted_cents(price: float, discount: float) -> int:
    price_value = Decimal(str(price))
    discount_value = Decimal(str(discount))
    if (
        not price_value.is_finite()
        or not discount_value.is_finite()
        or not 0 < price_value <= Decimal("999999.99")
        or not 0 <= discount_value < 1
    ):
        raise ValidationException("Product has invalid pricing; contact the store")
    cents = int((price_value * (1 - discount_value) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    if cents <= 0:
        raise ValidationException("Product price must be at least one cent")
    return cents


def promotion_discount_cents(subtotal_cents: int, percentage: int) -> int:
    if subtotal_cents <= 0 or not 1 <= percentage <= 99:
        raise ValidationException("Discount code has invalid pricing")
    return (subtotal_cents * percentage + 50) // 100


def parse_expiry(expires_at: str) -> datetime:
    try:
        value = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValidationException("Discount code has an invalid expiry configuration") from exc
    if value.tzinfo is None or value.utcoffset() is None or value.utcoffset().total_seconds() != 0:
        raise ValidationException("Discount code expiry must be configured in UTC")
    return value.astimezone(timezone.utc)


def validate_discount_code_expiry(expires_at: str, now: datetime | None = None) -> None:
    expiry = parse_expiry(expires_at)
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None or current.utcoffset() is None:
        raise ValueError("Current time must be timezone-aware")
    if current.astimezone(timezone.utc) >= expiry:
        raise ApiException(
            "This discount code has expired. Remove it or apply another valid code, then review your total.",
            "DISCOUNT_CODE_EXPIRED",
            400,
        )


def unknown_discount_code() -> ApiException:
    return ApiException(
        "This discount code is not valid. Check the code or remove it and review your total.",
        "DISCOUNT_CODE_INVALID",
        400,
    )


def simulate_payment(method: str) -> None:
    if method == "demo-declined":
        raise ApiException(
            "Demo payment was declined. Your cart is unchanged. Choose the approved demo method to retry.",
            "PAYMENT_DECLINED",
            402,
        )

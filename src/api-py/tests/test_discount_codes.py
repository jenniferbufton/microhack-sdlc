from __future__ import annotations

import sqlite3
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from main import app
from utils.checkout import validate_discount_code_expiry
from utils.errors import ApiException


@pytest.fixture
def discount_client(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    database = tmp_path / "discounts.db"
    monkeypatch.setenv("DB_FILE", str(database))
    monkeypatch.setenv("PAYMENT_PROVIDER", "mock")
    monkeypatch.setenv("PAYMENT_MOCK_ENABLED", "true")
    monkeypatch.setenv("PAYMENT_CURRENCY", "USD")
    with TestClient(app) as client:
        with sqlite3.connect(database) as connection:
            connection.execute("UPDATE products SET price = 1.005, discount = 0 WHERE product_id = 1")
            connection.execute("UPDATE products SET price = 20.25, discount = 0.1 WHERE product_id = 2")
            connection.execute(
                "INSERT INTO discount_codes (discount_code, percentage, expires_at) VALUES (?, ?, ?)",
                ("LAUNCH25", 25, (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()),
            )
            connection.execute(
                "INSERT INTO discount_codes (discount_code, percentage, expires_at) VALUES (?, ?, ?)",
                ("OLD10", 10, (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()),
            )
            connection.execute(
                "INSERT INTO discount_codes (discount_code, percentage, expires_at) VALUES (?, ?, ?)",
                ("FULL99", 99, (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()),
            )
        yield client, database


def quote_body(code: str | None = "launch25") -> dict:
    body = {"items": [{"productId": 1, "quantity": 3}, {"productId": 2, "quantity": 2}]}
    if code is not None:
        body["discountCode"] = code
    return body


def counts(database: Path) -> tuple[int, int, int]:
    with sqlite3.connect(database) as connection:
        return tuple(
            connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            for table in ("orders", "checkout_receipts", "order_discount_snapshots")
        )


def test_quote_normalizes_code_and_rounds_once(discount_client) -> None:
    client, database = discount_client
    before = counts(database)
    response = client.post("/api/checkout/quote", json=quote_body("  launch25 "))
    assert response.status_code == 200, response.text
    assert response.json() == {
        "currency": "USD",
        "subtotalCents": 3949,
        "discountCents": 987,
        "totalCents": 2962,
        "discountCode": "LAUNCH25",
        "percentage": 25,
    }
    assert counts(database) == before


def test_quote_without_code_and_existing_product_discounts(discount_client) -> None:
    client, _ = discount_client
    response = client.post("/api/checkout/quote", json=quote_body(None))
    assert response.status_code == 200
    assert response.json()["subtotalCents"] == response.json()["totalCents"] == 3949
    assert response.json()["discountCents"] == 0
    assert response.json()["discountCode"] is None


@pytest.mark.parametrize(
    ("code", "error", "status"),
    [
        ("DOES-NOT-EXIST", "DISCOUNT_CODE_INVALID", 400),
        ("OLD10", "DISCOUNT_CODE_EXPIRED", 400),
        ("not a code", "VALIDATION_ERROR", 422),
        ("", "VALIDATION_ERROR", 422),
        ("x" * 33, "VALIDATION_ERROR", 422),
    ],
)
def test_invalid_or_expired_quote(discount_client, code: str, error: str, status: int) -> None:
    client, database = discount_client
    before = counts(database)
    response = client.post("/api/checkout/quote", json=quote_body(code))
    assert response.status_code == status
    if status == 422:
        assert "detail" in response.json()
    else:
        assert response.json()["error"]["code"] == error
    assert counts(database) == before


def test_discounted_checkout_persists_snapshot_and_replays_after_expiry(discount_client) -> None:
    client, database = discount_client
    quote = client.post("/api/checkout/quote", json=quote_body("launch25")).json()
    body = {
        "requestKey": "705ac834-cc39-4e16-9755-ad99e68a7db7",
        "customerName": "Discount customer",
        "branchId": 1,
        **quote_body(" launch25 "),
        "expectedTotalCents": quote["totalCents"],
        "paymentMethod": "demo-approved",
    }
    before = counts(database)
    response = client.post("/api/checkout", json=body)
    assert response.status_code == 201, response.text
    result = response.json()
    assert result["subtotalCents"] == 3949
    assert result["discountCents"] == 987
    assert result["totalCents"] == 2962
    assert result["discountCode"] == "LAUNCH25"
    assert counts(database) == (before[0] + 1, before[1] + 1, before[2] + 1)
    with sqlite3.connect(database) as connection:
        assert connection.execute(
            "SELECT discount_code, percentage, subtotal_cents, discount_cents FROM order_discount_snapshots WHERE order_id = ?",
            (result["order"]["orderId"],),
        ).fetchone() == ("LAUNCH25", 25, 3949, 987)
        connection.execute(
            "UPDATE discount_codes SET expires_at = ? WHERE discount_code = ?",
            (datetime.now(timezone.utc).isoformat(), "LAUNCH25"),
        )
    replay = client.post("/api/checkout", json=body)
    assert replay.status_code == 200
    assert replay.json() == result
    body["discountCode"] = None
    assert client.post("/api/checkout", json=body).status_code == 409


def test_discounted_checkout_rejects_tampered_total_without_writes(discount_client) -> None:
    client, database = discount_client
    quote = client.post("/api/checkout/quote", json=quote_body()).json()
    body = {
        "requestKey": str(uuid4()),
        "customerName": "Discount customer",
        "branchId": 1,
        **quote_body(),
        "expectedTotalCents": quote["totalCents"] + 1,
        "paymentMethod": "demo-approved",
    }
    before = counts(database)
    response = client.post("/api/checkout", json=body)
    assert response.status_code == 409
    assert counts(database) == before


def test_concurrent_discounted_retries_create_one_order_and_snapshot(discount_client) -> None:
    client, database = discount_client
    quote = client.post("/api/checkout/quote", json=quote_body()).json()
    body = {
        "requestKey": str(uuid4()),
        "customerName": "Discount customer",
        "branchId": 1,
        **quote_body(),
        "expectedTotalCents": quote["totalCents"],
        "paymentMethod": "demo-approved",
    }
    before = counts(database)
    with ThreadPoolExecutor(max_workers=4) as executor:
        responses = list(executor.map(lambda _: client.post("/api/checkout", json=body), range(4)))
    assert sorted(response.status_code for response in responses) == [200, 200, 200, 201]
    assert len({response.json()["order"]["orderId"] for response in responses}) == 1
    assert all(response.json()["discountCode"] == "LAUNCH25" for response in responses)
    assert counts(database) == (before[0] + 1, before[1] + 1, before[2] + 1)


def test_discount_expires_between_quote_and_submission(discount_client) -> None:
    client, database = discount_client
    quote = client.post("/api/checkout/quote", json=quote_body()).json()
    body = {
        "requestKey": "e3f2a88f-c00f-4aa3-9bc5-b322810ac5bf",
        "customerName": "Discount customer",
        "branchId": 1,
        **quote_body(),
        "expectedTotalCents": quote["totalCents"],
        "paymentMethod": "demo-approved",
    }
    with sqlite3.connect(database) as connection:
        connection.execute(
            "UPDATE discount_codes SET expires_at = ? WHERE discount_code = ?",
            (datetime.now(timezone.utc).isoformat(), "LAUNCH25"),
        )
    before = counts(database)
    response = client.post("/api/checkout", json=body)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "DISCOUNT_CODE_EXPIRED"
    assert counts(database) == before


def test_full_discount_rounding_is_rejected(discount_client) -> None:
    client, database = discount_client
    with sqlite3.connect(database) as connection:
        connection.execute("UPDATE products SET price = 0.01 WHERE product_id = 1")
    response = client.post(
        "/api/checkout/quote",
        json={"items": [{"productId": 1, "quantity": 1}], "discountCode": "FULL99"},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "DISCOUNT_TOTAL_INVALID"


@pytest.mark.parametrize(
    ("code", "percentage", "expiry"),
    [
        ("INVALID", 0, "2030-01-01T00:00:00+00:00"),
        ("INVALID", 100, "2030-01-01T00:00:00+00:00"),
        ("INVALID", 10, "2030-01-01T00:00:00"),
        ("INVALID", 10, "2030-01-01T00:00:00+01:00"),
        ("lowercase", 10, "2030-01-01T00:00:00+00:00"),
        ("HAS SPACE", 10, "2030-01-01T00:00:00+00:00"),
    ],
)
def test_database_rejects_bad_campaign_configuration(
    discount_client, code: str, percentage: int, expiry: str
) -> None:
    _, database = discount_client
    with pytest.raises(sqlite3.IntegrityError):
        with sqlite3.connect(database) as connection:
            connection.execute(
                "INSERT INTO discount_codes (discount_code, percentage, expires_at) VALUES (?, ?, ?)",
                (code, percentage, expiry),
            )


def test_discount_expires_at_utc_boundary() -> None:
    expiry = "2030-01-01T00:00:00+00:00"
    before = datetime(2029, 12, 31, 23, 59, 59, tzinfo=timezone.utc)
    boundary = datetime(2030, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    validate_discount_code_expiry(expiry, before)
    with pytest.raises(ApiException) as error:
        validate_discount_code_expiry(expiry, boundary)
    assert error.value.code == "DISCOUNT_CODE_EXPIRED"


def test_snapshot_failure_rolls_back_order(discount_client) -> None:
    client, database = discount_client
    quote = client.post("/api/checkout/quote", json=quote_body()).json()
    body = {
        "requestKey": "6e74b049-9c89-4410-8d35-afd5e0b0fbd5",
        "customerName": "Discount customer",
        "branchId": 1,
        **quote_body(),
        "expectedTotalCents": quote["totalCents"],
        "paymentMethod": "demo-approved",
    }
    before = counts(database)
    with sqlite3.connect(database) as connection:
        connection.execute(
            "CREATE TRIGGER fail_discount_snapshot BEFORE INSERT ON order_discount_snapshots "
            "BEGIN SELECT RAISE(ABORT, 'test failure'); END"
        )
    response = client.post("/api/checkout", json=body)
    assert response.status_code == 500
    assert counts(database) == before


def test_order_deletion_is_blocked_by_discount_snapshot(discount_client) -> None:
    client, _ = discount_client
    quote = client.post("/api/checkout/quote", json=quote_body()).json()
    body = {
        "requestKey": "1e54b2a1-295a-4af4-8357-d9c85d933cad",
        "customerName": "Discount customer",
        "branchId": 1,
        **quote_body(),
        "expectedTotalCents": quote["totalCents"],
        "paymentMethod": "demo-approved",
    }
    result = client.post("/api/checkout", json=body).json()
    assert client.delete(f"/api/orders/{result['order']['orderId']}").status_code == 409

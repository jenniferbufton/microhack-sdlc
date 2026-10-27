from __future__ import annotations

import sqlite3
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from main import app
from utils.checkout import discounted_cents


@pytest.fixture
def checkout_client(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    database = tmp_path / "checkout.db"
    monkeypatch.setenv("DB_FILE", str(database))
    monkeypatch.setenv("PAYMENT_PROVIDER", "mock")
    monkeypatch.setenv("PAYMENT_MOCK_ENABLED", "true")
    monkeypatch.setenv("PAYMENT_CURRENCY", "USD")
    with TestClient(app) as client:
        with sqlite3.connect(database) as connection:
            connection.execute("UPDATE products SET price = 1.005, discount = 0 WHERE product_id = 1")
            connection.execute("UPDATE products SET price = 20.25, discount = 0.1 WHERE product_id = 2")
        yield client, database


def request_body() -> dict:
    return {
        "requestKey": str(uuid4()),
        "customerName": "  Test Customer  ",
        "branchId": 1,
        "items": [{"productId": 1, "quantity": 3}, {"productId": 2, "quantity": 2}],
        "expectedTotalCents": 3949,
        "paymentMethod": "demo-approved",
    }


def counts(database: Path) -> tuple[int, int, int, int]:
    with sqlite3.connect(database) as connection:
        return tuple(connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                     for table in ("orders", "order_details", "checkout_receipts", "order_discount_snapshots"))


def test_approved_checkout_and_replay(checkout_client) -> None:
    client, database = checkout_client
    before = counts(database)
    body = request_body()
    response = client.post("/api/checkout", json=body)
    assert response.status_code == 201, response.text
    result = response.json()
    assert result["totalCents"] == 3949
    assert result["currency"] == "USD"
    assert result["simulated"] is True
    assert result["order"]["name"] == "Test Customer"
    assert result["order"]["status"] == "confirmed"
    assert [(item["quantity"], item["unitPrice"]) for item in result["items"]] == [(3, 1.01), (2, 18.23)]
    assert counts(database) == (before[0] + 1, before[1] + 2, before[2] + 1, before[3] + 1)
    assert result["subtotalCents"] == result["totalCents"] == 3949
    assert result["discountCents"] == 0
    assert result["discountCode"] is None

    with sqlite3.connect(database) as connection:
        connection.execute("UPDATE products SET price = 999 WHERE product_id = 1")
    replay = client.post("/api/checkout", json=body)
    assert replay.status_code == 200
    assert replay.json() == result
    body["customerName"] = "Different customer"
    conflict = client.post("/api/checkout", json=body)
    assert conflict.status_code == 409
    assert counts(database) == (before[0] + 1, before[1] + 2, before[2] + 1, before[3] + 1)


@pytest.mark.parametrize(
    ("field", "value", "status"),
    [
        ("paymentMethod", "demo-declined", 402),
        ("paymentMethod", "real-card", 422),
        ("branchId", 999999, 404),
        ("branchId", True, 422),
        ("customerName", "   ", 422),
        ("expectedTotalCents", 3948, 409),
        ("expectedTotalCents", -1, 422),
        ("items", [], 422),
        ("items", [{"productId": 999999, "quantity": 1}], 404),
        ("items", [{"productId": 1, "quantity": 0}], 422),
        ("items", [{"productId": 1, "quantity": 1.5}], 422),
        ("items", [{"productId": 1, "quantity": 1000}], 422),
        ("items", [{"productId": 1, "quantity": 1}, {"productId": 1, "quantity": 2}], 422),
    ],
)
def test_rejected_checkout_has_no_writes(checkout_client, field, value, status) -> None:
    client, database = checkout_client
    before = counts(database)
    body = request_body()
    body[field] = value
    response = client.post("/api/checkout", json=body)
    assert response.status_code == status, response.text
    if status == 402:
        assert response.json()["error"]["code"] == "PAYMENT_DECLINED"
    assert counts(database) == before


@pytest.mark.parametrize(
    ("variable", "value"),
    [("PAYMENT_PROVIDER", "stripe"), ("PAYMENT_MOCK_ENABLED", "false"), ("PAYMENT_CURRENCY", "EUR")],
)
def test_disabled_provider(checkout_client, monkeypatch, variable, value) -> None:
    client, database = checkout_client
    before = counts(database)
    monkeypatch.setenv(variable, value)
    response = client.post("/api/checkout", json=request_body())
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "PAYMENT_UNAVAILABLE"
    assert counts(database) == before


@pytest.mark.parametrize("table", ["order_details", "checkout_receipts"])
def test_insert_failure_rolls_back_order(checkout_client, table) -> None:
    client, database = checkout_client
    before = counts(database)
    with sqlite3.connect(database) as connection:
        connection.execute(
            f"CREATE TRIGGER fail_checkout BEFORE INSERT ON {table} BEGIN SELECT RAISE(ABORT, 'test failure'); END"
        )
    response = client.post("/api/checkout", json=request_body())
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "DATABASE_ERROR"
    assert counts(database) == before


def test_concurrent_retries_create_one_order(checkout_client) -> None:
    client, database = checkout_client
    before = counts(database)
    body = request_body()
    with ThreadPoolExecutor(max_workers=4) as executor:
        responses = list(executor.map(lambda _: client.post("/api/checkout", json=body), range(4)))
    assert sorted(response.status_code for response in responses) == [200, 200, 200, 201]
    assert len({response.json()["order"]["orderId"] for response in responses}) == 1
    assert counts(database) == (before[0] + 1, before[1] + 2, before[2] + 1, before[3] + 1)


def test_receipt_prevents_order_deletion(checkout_client) -> None:
    client, _ = checkout_client
    body = request_body()
    result = client.post("/api/checkout", json=body).json()
    response = client.delete(f"/api/orders/{result['order']['orderId']}")
    assert response.status_code == 409
    replay = client.post("/api/checkout", json=body)
    assert replay.status_code == 200
    assert replay.json() == result
    assert client.get(f"/api/orders/{result['order']['orderId']}").status_code == 200


def test_legacy_receipt_replays_without_catalog_or_discount_snapshot(checkout_client) -> None:
    import hashlib
    import json

    client, database = checkout_client
    body = request_body()
    with sqlite3.connect(database) as connection:
        fingerprint_payload = {key: value for key, value in body.items() if key != "requestKey"}
        fingerprint_payload["customerName"] = "Test Customer"
        fingerprint_payload["items"] = sorted(fingerprint_payload["items"], key=lambda item: item["productId"])
        fingerprint = hashlib.sha256(json.dumps(fingerprint_payload, sort_keys=True).encode()).hexdigest()
        cursor = connection.execute(
            "INSERT INTO orders (branch_id, order_date, name, description, status) VALUES (?, ?, ?, ?, ?)",
            (1, "2025-01-01T00:00:00+00:00", "Test Customer", "old receipt", "confirmed"),
        )
        order_id = cursor.lastrowid
        connection.execute(
            "INSERT INTO checkout_receipts VALUES (?, ?, ?, ?, ?, ?)",
            (body["requestKey"], fingerprint, order_id, "USD", 3949, json.dumps({
                "order": {"orderId": order_id, "branchId": 1, "orderDate": "2025-01-01T00:00:00+00:00",
                          "name": "Test Customer", "description": "old receipt", "status": "confirmed"},
                "items": [], "currency": "USD", "totalCents": 3949, "simulated": True,
            })),
        )
    with sqlite3.connect(database) as connection:
        connection.execute("UPDATE products SET price = 999 WHERE product_id = 1")
    response = client.post("/api/checkout", json=body)
    assert response.status_code == 200
    assert response.json()["subtotalCents"] == 3949
    assert response.json()["discountCents"] == 0
    assert response.json()["discountCode"] is None


@pytest.mark.parametrize(
    ("price", "discount", "expected"),
    [(1.005, 0, 101), (20.25, 0.1, 1823), (0.05, 0.1, 5), (10, 0.333, 667)],
)
def test_exact_discount_rounding(price, discount, expected) -> None:
    assert discounted_cents(price, discount) == expected


@pytest.mark.parametrize(
    ("price", "discount"),
    [(0, 0), (-1, 0), (1, -0.1), (1, 1), (float("inf"), 0), (1, float("nan")), (0.001, 0)],
)
def test_invalid_catalog_pricing(price, discount) -> None:
    from utils.errors import ValidationException

    with pytest.raises(ValidationException):
        discounted_cents(price, discount)

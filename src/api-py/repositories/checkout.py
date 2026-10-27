from __future__ import annotations

import sqlite3
from datetime import datetime, timezone

import aiosqlite

from database.sqlite import get_connection
from models.checkout import CheckoutLine, CheckoutRequest, CheckoutResponse, QuoteRequest, QuoteResponse
from models.order import Order
from models.order_detail import OrderDetail
from utils.checkout import (
    discounted_cents,
    promotion_discount_cents,
    request_fingerprint,
    require_mock_provider,
    simulate_payment,
    validate_discount_code_expiry,
    unknown_discount_code,
)
from utils.errors import ApiException, ConflictException, DatabaseException, NotFoundException, ValidationException


class CheckoutRepository:
    async def quote(self, request: QuoteRequest) -> QuoteResponse:
        async with get_connection() as connection:
            subtotal, discount, code, percentage, total, _ = await self._calculate(
                connection, request.items, request.discountCode
            )
        return QuoteResponse(
            subtotalCents=subtotal,
            discountCents=discount,
            totalCents=total,
            discountCode=code,
            percentage=percentage,
        )

    async def create(self, request: CheckoutRequest) -> tuple[CheckoutResponse, bool]:
        require_mock_provider()
        fingerprint = request_fingerprint(request)
        async with get_connection() as connection:
            try:
                await connection.execute("BEGIN IMMEDIATE;")
                cursor = await connection.execute(
                    "SELECT request_fingerprint, response_json FROM checkout_receipts WHERE request_key = ?;",
                    (str(request.requestKey),),
                )
                receipt = await cursor.fetchone()
                if receipt:
                    if receipt["request_fingerprint"] != fingerprint:
                        raise ConflictException("Checkout request key was already used with different details")
                    result = CheckoutResponse.model_validate_json(receipt["response_json"])
                    await connection.rollback()
                    return result, True

                cursor = await connection.execute("SELECT branch_id FROM branches WHERE branch_id = ?;", (request.branchId,))
                if await cursor.fetchone() is None:
                    raise NotFoundException("Branch", request.branchId)

                subtotal, discount, code, percentage, total, prices = await self._calculate(
                    connection, request.items, request.discountCode
                )
                if total > 99_999_999:
                    raise ValidationException("Order total exceeds the demo checkout limit")
                if total != request.expectedTotalCents:
                    raise ConflictException(
                        "Product prices or the discount changed. Review the updated total before trying again"
                    )
                simulate_payment(request.paymentMethod)

                date = datetime.now(timezone.utc).isoformat()
                cursor = await connection.execute(
                    "INSERT INTO orders (branch_id, order_date, name, description, status) VALUES (?, ?, ?, ?, ?);",
                    (request.branchId, date, request.customerName, "Simulated payment; no money charged", "confirmed"),
                )
                if cursor.lastrowid is None:
                    raise DatabaseException("Failed to create checkout order")
                order = Order(
                    orderId=cursor.lastrowid, branchId=request.branchId, orderDate=date,
                    name=request.customerName, description="Simulated payment; no money charged", status="confirmed",
                )
                details: list[OrderDetail] = []
                for item in request.items:
                    unit_price = prices[item.productId] / 100
                    cursor = await connection.execute(
                        "INSERT INTO order_details (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?);",
                        (order.orderId, item.productId, item.quantity, unit_price),
                    )
                    if cursor.lastrowid is None:
                        raise DatabaseException("Failed to create checkout order details")
                    details.append(OrderDetail(
                        orderDetailId=cursor.lastrowid, orderId=order.orderId, productId=item.productId,
                        quantity=item.quantity, unitPrice=unit_price,
                    ))
                result = CheckoutResponse(
                    order=order,
                    items=details,
                    totalCents=total,
                    subtotalCents=subtotal,
                    discountCents=discount,
                    discountCode=code,
                )
                await connection.execute(
                    """INSERT INTO order_discount_snapshots
                       (order_id, discount_code, percentage, subtotal_cents, discount_cents)
                       VALUES (?, ?, ?, ?, ?);""",
                    (order.orderId, code, percentage or 0, subtotal, discount),
                )
                await connection.execute(
                    """INSERT INTO checkout_receipts
                       (request_key, request_fingerprint, order_id, currency, total_cents, response_json)
                       VALUES (?, ?, ?, ?, ?, ?);""",
                    (str(request.requestKey), fingerprint, order.orderId, "USD", total, result.model_dump_json()),
                )
                await connection.commit()
                return result, False
            except sqlite3.Error as exc:
                await connection.rollback()
                raise DatabaseException("Checkout could not be saved. Retry with the same request key.") from exc
            except Exception:
                await connection.rollback()
                raise

    @staticmethod
    async def _calculate(
        connection: aiosqlite.Connection,
        items: list[CheckoutLine],
        discount_code: str | None,
    ) -> tuple[int, int, str | None, int | None, int, dict[int, int]]:
        ids = [item.productId for item in items]
        placeholders = ",".join("?" for _ in ids)
        cursor = await connection.execute(
            f"SELECT product_id, price, discount FROM products WHERE product_id IN ({placeholders});",
            ids,
        )
        products = {row["product_id"]: row for row in await cursor.fetchall()}
        prices: dict[int, int] = {}
        for item in items:
            product = products.get(item.productId)
            if product is None:
                raise NotFoundException("Product", item.productId)
            prices[item.productId] = discounted_cents(product["price"], product["discount"])
        subtotal = sum(prices[item.productId] * item.quantity for item in items)
        code = None
        percentage = None
        discount = 0
        if discount_code is not None:
            cursor = await connection.execute(
                "SELECT percentage, expires_at FROM discount_codes WHERE discount_code = ?;",
                (discount_code,),
            )
            definition = await cursor.fetchone()
            if definition is None:
                raise unknown_discount_code()
            validate_discount_code_expiry(definition["expires_at"])
            code = discount_code
            percentage = definition["percentage"]
            discount = promotion_discount_cents(subtotal, percentage)
            if subtotal - discount <= 0:
                raise ApiException(
                    "This discount would make the order free. Use a smaller discount or add items.",
                    "DISCOUNT_TOTAL_INVALID",
                    400,
                )
        total = subtotal - discount
        return subtotal, discount, code, percentage, total, prices

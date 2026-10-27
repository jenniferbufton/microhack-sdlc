from __future__ import annotations

import re
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from models.order import Order
from models.order_detail import OrderDetail


class CheckoutLine(BaseModel):
    model_config = ConfigDict(extra="forbid")

    productId: int = Field(gt=0, strict=True)
    quantity: int = Field(gt=0, le=999, strict=True)


class CheckoutRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    requestKey: UUID
    customerName: str = Field(min_length=1, max_length=100)
    branchId: int = Field(gt=0, strict=True)
    items: list[CheckoutLine] = Field(min_length=1, max_length=100)
    expectedTotalCents: int = Field(gt=0, le=99_999_999, strict=True)
    paymentMethod: Literal["demo-approved", "demo-declined"]
    discountCode: str | None = None

    @field_validator("customerName")
    @classmethod
    def strip_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Customer name is required")
        return value

    @field_validator("discountCode")
    @classmethod
    def normalize_discount_code(cls, value: str | None) -> str | None:
        return normalize_discount_code(value)

    @model_validator(mode="after")
    def unique_products(self) -> CheckoutRequest:
        if len({item.productId for item in self.items}) != len(self.items):
            raise ValueError("Each product may appear only once")
        return self


class CheckoutResponse(BaseModel):
    order: Order
    items: list[OrderDetail]
    currency: Literal["USD"] = "USD"
    totalCents: int
    simulated: Literal[True] = True
    subtotalCents: int | None = None
    discountCents: int = 0
    discountCode: str | None = None

    @model_validator(mode="after")
    def fill_legacy_pricing(self) -> CheckoutResponse:
        if self.subtotalCents is None:
            self.subtotalCents = self.totalCents
        return self


class QuoteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[CheckoutLine] = Field(min_length=1, max_length=100)
    discountCode: str | None = None

    @field_validator("discountCode")
    @classmethod
    def normalize_discount_code(cls, value: str | None) -> str | None:
        return normalize_discount_code(value)

    @model_validator(mode="after")
    def unique_products(self) -> QuoteRequest:
        if len({item.productId for item in self.items}) != len(self.items):
            raise ValueError("Each product may appear only once")
        return self


class QuoteResponse(BaseModel):
    currency: Literal["USD"] = "USD"
    subtotalCents: int
    discountCents: int
    totalCents: int
    discountCode: str | None = None
    percentage: int | None = None


def normalize_discount_code(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip().upper()
    if not re.fullmatch(r"[A-Z0-9][A-Z0-9-]{0,31}", normalized):
        raise ValueError("Code must contain 1-32 letters, numbers, or hyphens")
    return normalized

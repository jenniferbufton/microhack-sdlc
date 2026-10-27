from __future__ import annotations

from fastapi import APIRouter, Response

from models.checkout import CheckoutRequest, CheckoutResponse, QuoteRequest, QuoteResponse
from repositories.checkout import CheckoutRepository

router = APIRouter(prefix="/api/checkout", tags=["Checkout"])
repository = CheckoutRepository()


@router.post(
    "", response_model=CheckoutResponse, status_code=201,
    responses={
        200: {"description": "Successful replay of an existing checkout", "model": CheckoutResponse},
        402: {"description": "Demo payment declined; no order created"},
        409: {"description": "Prices changed or request key reused with different details"},
        400: {"description": "Discount code invalid or expired; no order created"},
        503: {"description": "Mock provider is disabled or misconfigured"},
    },
)
async def checkout(request: CheckoutRequest, response: Response) -> CheckoutResponse:
    result, replayed = await repository.create(request)
    response.status_code = 200 if replayed else 201
    return result


@router.post(
    "/quote",
    response_model=QuoteResponse,
    responses={
        400: {"description": "Discount code invalid or expired"},
        404: {"description": "One or more products do not exist"},
    },
)
async def quote(request: QuoteRequest) -> QuoteResponse:
    return await repository.quote(request)

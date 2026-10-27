# OctoSupply API (Python)

FastAPI port of the OctoSupply API.

## Run

```bash
pip install -r requirements.txt
uvicorn main:app --reload --port 3000
```

Default API URL: `http://localhost:3000`

## Container image

Build from the repository root so the image can include the shared SQL
migrations and seed files:

```bash
docker build -f src/api-py/Dockerfile -t octocat-api:local .
docker run --rm -p 3000:3000 \
  -e API_CORS_ORIGINS=http://localhost:8080 \
  -e PAYMENT_PROVIDER=mock \
  -e PAYMENT_MOCK_ENABLED=true \
  -e PAYMENT_CURRENCY=USD \
  octocat-api:local
```

The image runs Uvicorn on port 3000 as a non-root user and applies migrations
and seeds at startup. Its default database path is `/app/data/app.db`. That file
is on the container filesystem and is not durable across container replacement.
See the [Azure deployment guide](../../infra/README.md) for the demo's single
replica and OIDC configuration.

## Environment

- `PORT` (used by Makefile/uvicorn command, default `3000`)
- `DB_FILE` (default: `./data/app.db`)
- `API_CORS_ORIGINS` (comma-separated override; optional)
- `DB_MIGRATIONS_DIR` (optional override for migrations directory)
- `PAYMENT_PROVIDER=mock`, `PAYMENT_MOCK_ENABLED=true`, and `PAYMENT_CURRENCY=USD`
  must all be explicitly set to enable demo checkout. It is unavailable by default.

## Database

On startup, the API applies SQL migrations from:

- `../database/migrations/*.sql`

and seeds from:

- `../database/seed/*.sql`

## OpenAPI

- OpenAPI JSON: `http://localhost:3000/openapi.json`
- Swagger UI: `http://localhost:3000/docs`

## Simulated checkout

`POST /api/checkout` creates one confirmed order, its details, and a durable checkout
receipt in a single transaction. This is a guest demo, not an authenticated or real
payment service. It never accepts card numbers or charges money.

```json
{
  "requestKey": "ee4fa799-8d16-49f4-a546-40367429b86c",
  "customerName": "Alex Customer",
  "branchId": 1,
  "items": [{"productId": 1, "quantity": 1}],
  "expectedTotalCents": 9749,
  "paymentMethod": "demo-approved"
}
```

Use an existing branch/product and the current total, not a hardcoded example
amount. USD discounted unit prices are rounded half-up to cents before multiplying
by quantities. The API computes authoritative prices from the catalog; stale
expected totals return 409. Each product may appear once, quantities are 1-999,
at most 100 product lines are accepted, and the total is limited to 99,999,999 cents.
There is no tax, shipping, inventory reservation, or real payment.

### Discount-code quotes

`POST /api/checkout/quote` validates a read-only price quote; it does not reserve
or consume a code and creates no order or snapshot.

```json
{
  "items": [{"productId": 1, "quantity": 2}],
  "discountCode": "YOUR_CODE"
}
```

The response contains `currency`, `subtotalCents`, `discountCents`, `totalCents`,
`discountCode`, and `percentage`. Codes are trimmed, case-insensitive, and limited
to one per order. A promotion is a whole-number percentage from 1 through 99,
applied after catalog discounts. Catalog-discounted unit prices are rounded
half-up to cents first; the promotion is then rounded half-up once on the subtotal.
Codes expire at or after their timezone-aware UTC expiry. An unknown code or an
expired code returns 400; malformed requests return 422. A code that would make
the order free is rejected.

Checkout revalidates the code and expected total inside its write transaction.
Successful responses now include `subtotalCents`, `discountCents`, and
`discountCode` alongside `totalCents`. The order's discount snapshot is separate
from the mutable campaign definition and remains unchanged if the campaign later
expires or is edited. The discount-code table is intentionally empty after
migration; no live campaign is created or seeded by this feature.

Operators provision campaigns only after receiving approved code, percentage, and
expiry values. Set `DB_FILE`, `DISCOUNT_CODE`, `DISCOUNT_PERCENTAGE`, and
`DISCOUNT_EXPIRES_AT` from the approved configuration, then run this parameterized
provisioning snippet from `src/api-py`:

```python
import os
import re
import sqlite3
from datetime import datetime, timezone

code = os.environ["DISCOUNT_CODE"].strip().upper()
percentage = int(os.environ["DISCOUNT_PERCENTAGE"])
expiry = datetime.fromisoformat(os.environ["DISCOUNT_EXPIRES_AT"].replace("Z", "+00:00"))
if not re.fullmatch(r"[A-Z0-9][A-Z0-9-]{0,31}", code):
    raise ValueError("Discount code must be 1-32 letters, numbers, or hyphens")
if not 1 <= percentage <= 99:
    raise ValueError("Discount percentage must be from 1 through 99")
if expiry.tzinfo is None or expiry.utcoffset() is None or expiry.utcoffset().total_seconds() != 0:
    raise ValueError("Discount expiry must include a UTC timezone")

with sqlite3.connect(os.environ["DB_FILE"]) as connection:
    connection.execute(
        "INSERT INTO discount_codes (discount_code, percentage, expires_at) VALUES (?, ?, ?)",
        (code, percentage, expiry.astimezone(timezone.utc).isoformat()),
    )
```

Success returns 201 with `{order, items, currency, totalCents, simulated: true,
subtotalCents, discountCents, discountCode}`.
Retrying the same UUID and payload returns 200 with the recorded response, even
after prices change. Reusing the key with different details returns 409. Retain the
same key and payload after a network error or 5xx: an order may already be committed.
The receipt prevents deletion of its order (409), preserving replay guarantees.

`demo-declined` returns 402 (`PAYMENT_DECLINED`) without creating records.
Invalid requests return 422, missing entities 404, invalid/expired campaigns 400,
pricing conflicts 409, disabled provider configuration 503 (`PAYMENT_UNAVAILABLE`),
and database failures 500 with the standard error envelope. All checkout database
writes roll back together.
Real-provider integration would need a separate payment lifecycle/reconciliation
design, not an external charge inside a SQLite transaction.

For the Docker frontend, run from this directory:

```sh
PAYMENT_PROVIDER=mock PAYMENT_MOCK_ENABLED=true PAYMENT_CURRENCY=USD \
API_CORS_ORIGINS=http://localhost:8080,http://localhost:5137 \
./.venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 3000
```

See [the Docker checkout guide](../docs/build.md#docker-frontend-and-demo-checkout)
for frontend and test commands.

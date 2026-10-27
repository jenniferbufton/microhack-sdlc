# Building and testing OctoSupply

This checkout contains the Python and C# APIs plus a shared React frontend. The
Python API is used by the Azure deployment and includes the demo checkout
features. Follow the track-specific commands below; the aggregate Make targets
still reference API directories that are no longer in this checkout.

## Prerequisites

- Python 3.10 or later for the Python API.
- .NET 10 for the C# API.
- Node.js and npm for native frontend development. The Dev Container provides
  Node.js 24.
- Docker Desktop for the container workflows.

## Install dependencies

Run from `src/` and install only the track you plan to use:

```sh
make install-py install-frontend
```

For the C# API, run:

```sh
make install-cs install-frontend
```

Do not use the aggregate `make install` target in this checkout: it attempts to
install the removed TypeScript API.

## Build, lint, and test

From `src/`:

```sh
# Python API
make build-py
make test-py

# C# API
make build-cs
make test-cs

# Frontend
make build-frontend
make test-frontend
```

Run frontend linting from `src/frontend/`:

```sh
npm run lint
```

`make test-frontend` installs Chromium if it is not already cached. `make
test-e2e` runs the end-to-end suite. The aggregate `make build`, `make test`,
and `make lint` targets still reference the missing TypeScript API and should
not be used.

## Run in development

From `src/`, start an API and the frontend together:

```sh
make dev-py
```

Use `make dev-cs` to run the C# API with the same frontend. Both APIs listen on
port 3000; Vite serves the frontend on port 5137. The API-only targets are
`make dev-api-py` and `make dev-api-cs`.

The default `make dev` target and `make dev-frontend` still point at the
removed TypeScript API. For a manually started frontend, set `VITE_API_URL` to
the API URL before starting Vite.

## Docker frontend and demo checkout

Start Docker Desktop. From `src/api-py`, start the Python API using its existing
virtual environment:

```sh
PAYMENT_PROVIDER=mock PAYMENT_MOCK_ENABLED=true PAYMENT_CURRENCY=USD \
API_CORS_ORIGINS=http://localhost:8080,http://localhost:5137 \
./.venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 3000
```

The API applies the checkout-receipt migration on startup. Set `DB_FILE` to a
separate SQLite path if you want an isolated demo database. The simulator is
disabled unless all three payment settings above match; it uses no secret keys.
The discount-code migration creates no campaigns. Only provision an approved
code, percentage, and UTC expiry in the API database; do not use a production
campaign while running browser tests.

From the repository root:

```sh
docker build -t octocat-frontend ./src/frontend
docker run --rm --name octocat-frontend -p 8080:80 \
  -e API_HOST=localhost -e API_PORT=3000 -e API_PROTOCOL=http \
  octocat-frontend
```

If that container name or port is already in use, inspect the existing
container before stopping or replacing it. Open `http://localhost:8080/products`,
add products, open Cart, and select Checkout. Choose an existing branch and a
demo payment method. Approved payments show an order receipt; declines leave the
cart intact. Cancellation before submission also leaves it intact. Network
failures retain a saved attempt; use Retry saved checkout to recover without
creating another order.

The checkout can apply one percentage discount code. The API provides
authoritative quotes and checks the code and total again during order creation.
Expiry or a price change blocks submission until the code is removed or
replaced and the revised total is explicitly reviewed.

`API_HOST` becomes a browser-side runtime URL. For a browser on the host machine,
`localhost:3000` reaches the host API. `host.docker.internal` is useful for a
client inside Docker, but is not automatically resolvable by the host browser.
Keep CORS origins explicit. No API credentials belong in the frontend runtime
configuration.

### Docker validation

From `src/`, run the Python API tests and syntax check:

```sh
make test-py build-py
```

From the repository root, build and lint the frontend without installing Node on
the host:

```sh
docker build --target builder -t octocat-frontend-check ./src/frontend
docker run --rm octocat-frontend-check npm run lint
```

The builder runs `npm run build`, including the TypeScript check. With the
frontend container and mock-enabled Python API running, use the existing
Playwright runner from `src/frontend`:

```sh
PLAYWRIGHT_BASE_URL=http://localhost:8080 PLAYWRIGHT_WEB_SERVER=false npm run test:e2e
```

`E2E_API_URL` optionally overrides the browser/API test URL through the shared
test fixture, without changing deployed frontend configuration. Container-based
browser tests can use a localhost frontend origin on the Docker host network and
`E2E_API_URL=http://host.docker.internal:3000`. Add the exact frontend origin to
`API_CORS_ORIGINS`. Match the Playwright image version to the installed test
package. The optional real-API discount browser cases require
`E2E_DISCOUNT_CODE` to name a test-only campaign already provisioned in the
isolated API database. API tests create their own temporary campaign data and
never depend on an external offer.

The checkout suite exercises the real API for successful orders, declines, and
lost success-response recovery. It also covers cart edits/persistence, network
errors, price conflicts, cross-tab preservation, rounding, corrupt storage, and
mobile keyboard interaction. Discount API tests cover expiry between quote and
checkout; the browser's expiry-review case simulates the checkout rejection
after a real quote. This remains a simulator: real payments, authentication,
tax/shipping calculation, refunds, and inventory management are out of scope.

For the API image and Azure deployment, see [system overview and deployment](system-overview-and-deployment.md)
and the [Azure deployment guide](../../infra/README.md).

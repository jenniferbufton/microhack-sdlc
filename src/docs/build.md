# Building and Testing the OctoCAT Supply Chain Application

This guide provides instructions for building, running, and testing the OctoCAT Supply Chain Management application, which consists of an API component and a React Frontend.

## Prerequisites

For the local Python API plus Docker frontend checkout workflow, use the
[Docker frontend and demo checkout](#docker-frontend-and-demo-checkout) section.
It does not require a host Node installation.

- Node.js (version 18 or higher)
- npm (latest version recommended)
- Docker/Podman (optional, for containerization)

## Docker frontend and demo checkout

Start Docker Desktop. From `src/api-py`, start the Python API using its existing
virtual environment:

```sh
PAYMENT_PROVIDER=mock PAYMENT_MOCK_ENABLED=true PAYMENT_CURRENCY=USD \
API_CORS_ORIGINS=http://localhost:8080,http://localhost:5137 \
./.venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 3000
```

The API applies the additive checkout-receipt migration on startup. Set `DB_FILE`
to a separate SQLite path if you want an isolated demo database. The simulator is
disabled unless all three payment settings above match; it uses no secret keys.
The discount-code migration creates no campaigns. Only provision an approved code,
percentage, and UTC expiry in the API database; do not use a production campaign
while running browser tests.

From the repository root:

```sh
docker build -t octocat-frontend ./src/frontend
docker run --rm --name octocat-frontend -p 8080:80 \
  -e API_HOST=localhost -e API_PORT=3000 -e API_PROTOCOL=http \
  octocat-frontend
```

If that container name or port is already in use, inspect the existing container
before stopping/replacing it. Open `http://localhost:8080/products`, add products,
open Cart, and select Checkout. Choose an existing branch and a demo payment method.
Approved payments show an order receipt; declines leave the cart intact. Cancellation
before submission also leaves it intact. Network failures retain a saved attempt;
use Retry saved checkout to recover without creating another order.
The checkout can apply one percentage discount code. The API provides authoritative
quotes and checks the code and total again during order creation. Expiry or a price
change blocks submission until the code is removed or replaced and the revised
total is explicitly reviewed.

`API_HOST` becomes a browser-side runtime URL. For a browser on the host machine,
`localhost:3000` reaches the host API. `host.docker.internal` is useful for a client
inside Docker, but is not automatically resolvable by the host browser. Keep CORS
origins explicit. No API credentials belong in the frontend runtime configuration.

### Validation

From `src/`, run `make test-py build-py`. Tests should use an isolated `DB_FILE`.
From the repository root, build and lint without installing Node on the host:

```sh
docker build --target builder -t octocat-frontend-check ./src/frontend
docker run --rm octocat-frontend-check npm run lint
```

The builder runs `npm run build`, including the TypeScript check. With the deployed
frontend and mock-enabled Python API running, use the existing Playwright runner
from `src/frontend` (or a compatible Playwright container):

```sh
PLAYWRIGHT_BASE_URL=http://localhost:8080 PLAYWRIGHT_WEB_SERVER=false npm run test:e2e
```

`E2E_API_URL` optionally overrides the browser/API test URL through the shared test
fixture, without changing the deployed frontend configuration. Container-based
browser tests can use a localhost frontend origin on the Docker host network and
`E2E_API_URL=http://host.docker.internal:3000`. Add the exact frontend origin to
`API_CORS_ORIGINS`. Match the Playwright image version to the installed test package.
The optional real-API discount browser cases require `E2E_DISCOUNT_CODE` to name a
test-only campaign already provisioned in the isolated API database. API tests
create their own temporary campaign data and never depend on an external offer.

The checkout suite exercises the real API for successful orders, declines, and lost
success-response recovery. It also covers cart edits/persistence, network errors,
price conflicts, cross-tab preservation, rounding, corrupt storage, and mobile
keyboard interaction. Discount API tests cover expiry between quote and checkout;
the browser's expiry-review case simulates the checkout rejection after a real quote.
This remains a simulator: real payments, authentication, tax/shipping calculation,
refunds, and inventory management are out of scope.

## Installation

1. Clone the repository
2. Install dependencies:

```bash
make install
```

## Building the Application

### Using Make Commands

You can build the entire application or its individual components using the following commands:

```bash
# Build both API and Frontend components
make build

# Build only the TypeScript API component
make build-ts

# Build only the Frontend component
make build-frontend
```

Alternatively, if you're in the `api-ts/` or `frontend/` directories, you can use npm commands directly:

```bash
cd api-ts && npm run build
cd frontend && npm run build
```

### Database management

```bash
# Initialize DB schema (runs migrations)
make db-init

# Seed sample data
make db-seed
```

Alternatively, if you're in the `api-ts/` directory, you can use npm commands directly:

```bash
cd api-ts
npm run db:init
npm run db:seed
```

Environment variables:

- DB_FILE: path to SQLite database file (default: `api-ts/data/app.db`)
- DB_ENABLE_WAL: enable WAL mode (default: true)
- DB_FOREIGN_KEYS: enforce foreign keys (default: true)
- DB_TIMEOUT: busy timeout in ms (default: 30000)

### Using VS Code Tasks

VS Code tasks have been configured to streamline the build process:

1. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS) to open the Command Palette
2. Type `Tasks: Run Task` and select it
3. Choose from the following tasks:
   - `Build All`: Builds both API and Frontend components
   - `Build API`: Builds only the API component
   - `Build Frontend`: Builds only the Frontend component

Alternatively, you can press `Ctrl+Shift+B` (or `Cmd+Shift+B` on macOS) to run the default build task (`Build All`).

## Running the Application

### Using Make Commands

```bash
# Start both API and Frontend in development mode with hot reloading
make dev

# Start only the TypeScript API in development mode
make dev-api-ts

# Start only the Frontend in development mode
make dev-frontend

# Start the application in production mode
make start
```

Alternatively, if you're in the `api-ts/` or `frontend/` directories, you can use npm commands directly:

```bash
cd api-ts && npm run dev
cd frontend && npm run dev
```

### Using VS Code Debugger

1. Open the Debug panel (`Ctrl+Shift+D` or `Cmd+Shift+D` on macOS)
2. Select `Start API & Frontend` from the dropdown menu
3. Click the green play button or press F5

This will start both the API and Frontend in development mode with the integrated terminal, allowing you to see the console output.

## Testing the Application

### Running Tests

```bash
# Run all tests
make test

# Run TypeScript API tests only
make test-ts

# Run frontend tests only
make test-frontend
```

Alternatively, if you're in the `api-ts/` or `frontend/` directories, you can use npm commands directly:

```bash
cd api-ts && npm run test
cd frontend && npm run test
```

### Linting

```bash
# Run linting checks
make lint
```

Alternatively, if you're in the `api-ts/` or `frontend/` directory, you can use npm commands directly:

```bash
cd frontend && npm run lint
```

```bash
cd api-ts && npm run lint
```

## Additional Information

### Port Configuration

The API runs on port 3000 by default, and the Frontend runs on port 5137. When running in a Codespace environment, ensure that the API port visibility is set to `public` to avoid CORS errors when the Frontend tries to communicate with the API.

For Docker, the sample compose maps API to 3000 and frontend to 3001.

### Docker Deployment

The project includes Dockerfiles for both API and Frontend components and a docker-compose.yml file for easy containerized deployment:

```bash
# Build and start using Docker Compose
docker-compose up --build
```

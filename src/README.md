# OctoSupply source code

This directory contains the OctoSupply application: a React frontend, two API
implementations, and shared SQLite migrations and seed data. The APIs are not
guaranteed to have identical feature coverage; the Python API is the primary
track for checkout and Azure deployment.

## Current layout

| Path | Purpose |
| --- | --- |
| `api-py/` | FastAPI API (Python 3.10+), listening on port 3000 |
| `api-cs/` | ASP.NET Core API (.NET 10), listening on port 3000 |
| `api-cs-tests/` | xUnit tests for the C# API |
| `frontend/` | React + TypeScript + Vite frontend; Vite uses port 5137 |
| `database/migrations/` | Shared, ordered SQLite schema migrations |
| `database/seed/` | SQL seed data applied when the database is empty |
| `docs/` | Architecture, build, deployment, SQLite, and observability guides |

The TypeScript and Java API directories described by older material are not
present in this checkout. The `Makefile` still contains aggregate targets that
reference those removed tracks; use only the track-specific commands below.

## Install

Run commands from this directory. Install only the API track and frontend you
intend to use:

```sh
make install-py install-frontend
```

For the C# API, use `make install-cs install-frontend` instead.

## Build and test

| Track | Build / validation | Tests |
| --- | --- | --- |
| Python API | `make build-py` | `make test-py` |
| C# API | `make build-cs` | `make test-cs` |
| Frontend | `make build-frontend` | `make test-frontend` |

Run frontend linting from `frontend/` with `npm run lint`. The frontend
Playwright tests may require browser installation; `make test-frontend`
installs Chromium if it is not already cached.

## Run locally

Start the Python API and frontend together:

```sh
make dev-py
```

Or use `make dev-cs` for the C# API. Both serve the API on port 3000 and the
frontend on port 5137. `make dev-api-py` and `make dev-api-cs` start only the
selected API.

Avoid the default `make dev` target: it still starts the removed TypeScript API.
The aggregate `make install`, `make build`, `make test`, and `make lint` targets
also include that missing track. The Makefile has stale Java targets as well.

## API and database notes

- The Python API provides Swagger UI at `/docs`; the C# API exposes OpenAPI JSON
  at `/api-docs.json`.
- Both APIs apply shared SQL migrations and seed data on startup.
- `DB_FILE` overrides the default `./data/app.db` path, which is relative to the
  API process's working directory. Start the API from its own directory so the
  relative migration and seed paths resolve correctly.
- The Azure deployment uses the Python API. Its SQLite file is on the container
  filesystem and is not durable across container replacement.

See [build and test](docs/build.md), [architecture](docs/architecture.md),
[SQLite integration](docs/sqlite-integration.md), and
[system overview and deployment](docs/system-overview-and-deployment.md).

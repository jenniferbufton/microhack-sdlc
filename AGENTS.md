# AGENTS.md

Guidance for AI coding agents working in this repository. Run all commands from the path shown.

## Repository Layout

- `src/api-py`: FastAPI API (primary track for agent work)
- `src/frontend`: React + Vite + Tailwind UI, shared by all API tracks
- `src/database`: SQL migrations and seeds, shared by all API tracks
- `src/api-cs`, `src/api-cs-tests`: ASP.NET API and tests
- `src/api-ts`, `src/api-java`: not present in the current working tree (tracked files show as deleted). Do not restore them without asking.
- `infra/`: Azure Bicep and deployment
- `src/Makefile`: all build, test, and run targets (run `make help` from `src/`)

## Build and Test Commands

### Python API (`src/api-py`)

| Step | Command (from `src/`) | Direct equivalent (from `src/api-py`) |
|------|-----------------------|---------------------------------------|
| Install | `make install-py` | `python3 -m venv .venv && ./.venv/bin/python -m pip install -r requirements.txt` |
| Install (uv, used locally) | n/a | `uv venv --python 3.12 .venv && uv pip install -r requirements.txt` |
| Validate | `make build-py` | `./.venv/bin/python -m py_compile main.py` |
| Test (all) | `make test-py` | `./.venv/bin/python -m pytest` |
| Test (one) | n/a | `./.venv/bin/python -m pytest tests/test_main.py::test_root` |
| Run (port 3000) | `make dev-api-py` | `./.venv/bin/python -m uvicorn main:app --reload --port 3000` |

- Run and test from `src/api-py`. Migrations and seeds resolve relative to the current working directory.
- Python 3.10+ is required; the local `.venv` uses 3.12.
- There is no Python linter or formatter configured. Do not add one unless asked.

### Frontend (`src/frontend`)

| Step | Command (from `src/`) | Direct equivalent (from `src/frontend`) |
|------|-----------------------|-----------------------------------------|
| Install | `make install-frontend` | `npm install` |
| Build (type check + bundle) | `make build-frontend` | `npm run build` |
| Lint | n/a | `npm run lint` |
| Test (Playwright) | `make test-frontend` | `npm run test` |
| E2E only | `make test-e2e` | `npm run test:e2e` |
| Dev server (port 5137) | `make dev-frontend` | `npm run dev` |

- Run `npm run build` and `npm run lint` before reporting frontend work as done.
- `make test-frontend` installs Playwright browsers first. Use `PLAYWRIGHT_BROWSERS_PATH` to override the cache location.
- Tests live in `src/frontend/tests/e2e` and `src/frontend/tests/features`.

#### Run the frontend locally in Docker

Use the Docker image for a local frontend preview rather than `npm run dev`. From the repository root, build and run it with:

```sh
docker build -t octocat-frontend ./src/frontend
docker run --rm --name octocat-frontend -p 8080:80 \
  -e API_HOST=host.docker.internal \
  -e API_PORT=3000 \
  -e API_PROTOCOL=http \
  octocat-frontend
```

Open `http://localhost:8080`. If a container named `octocat-frontend` is already running, stop it with `docker stop octocat-frontend` before starting its replacement. The API settings generate the frontend's runtime configuration; use a hostname reachable from the container if the API runs in Docker. Stop the foreground container with Ctrl+C. Rebuild the image after frontend source changes; keep using the npm scripts above for linting, tests, and build validation.

### Verification Checklist

Before reporting work as complete, run the commands for each track you changed:

- Python API change: `make test-py` and `make build-py`
- Frontend change: `npm run lint` and `npm run build` (from `src/frontend`)
- Database change: start the Python API so migrations apply, then run `make test-py`

## Naming and Code Conventions

### Naming
- API JSON fields are camelCase (`productId`, `supplierId`, `imgName`). Database columns are snake_case (`product_id`). Map between them in the repository layer (`_map_row`), not in routes.
- REST paths are plural, kebab-case resources under `/api/` (for example `/api/order-details`).
- Python modules and functions are snake_case. Routes and repositories are named by plural resource (`products.py`). Models are singular (`product.py`). Request models are `Create<Entity>Request` and `Update<Entity>Request`.
- Frontend component files are PascalCase (`Products.tsx`) and export React components as default. TypeScript interfaces use the same field names as the API.

### Python API Patterns
- Keep routes thin. Put SQL in `repositories/<resource>.py`.
- Use `?` placeholders for every query. Never format SQL strings.
- Raise shared exceptions from `utils/errors.py` (`NotFoundException`, `ValidationException`, `DatabaseException`).
- Start modules with `from __future__ import annotations`.
- Use `async` routes and repositories with `get_connection()`.

### Frontend Patterns
- Build API URLs from `api.baseURL` and `api.endpoints` in `src/frontend/src/api/config.ts`. Never hardcode hosts.
- Fetch server data with React Query `useQuery`, keyed by resource name.
- Use Tailwind for styling and `useTheme` for dark mode.
- Always use braces on `if` and `for` bodies (ESLint `curly: all`).
- Deployment config comes from `window.RUNTIME_CONFIG` or environment variables, not build-time constants.

### Known Defects (do not copy)
- The loop in `src/frontend/src/components/entity/product/Products.tsx` has a wrong increment and bound. Fix it only when you are already changing that file.

## Scope Rules

Keep diffs minimal and within the task.

- Change only the files the task requires. Do not reformat or rename unrelated code.
- Do not edit generated or local-only artifacts: `src/api-py/.venv/`, `__pycache__/`, `.pytest_cache/`, `src/api-py/data/` (SQLite files), `src/frontend/dist/`, `node_modules/`, `.github/state.md`.
- Do not change `infra/`, `.github/workflows/`, or Dockerfiles unless the task is explicitly about deployment.
- Do not modify `src/api-cs`, `src/api-cs-tests`, or other API tracks when the task is about `src/api-py`.
- Do not change files under `src/database/migrations/` or `src/database/seed/` without asking. They are shared by every API track.
- Do not add dependencies, linters, or config files without asking.
- Do not restore the missing `src/api-ts` or `src/api-java` folders without asking.
- Add or update tests for new repository logic and critical UI paths.
- Update documentation when behavior changes: `src/docs/` and the relevant README.

## Reporting

- State which commands you ran and their results.
- If a command cannot run in this environment, say so and name the command.

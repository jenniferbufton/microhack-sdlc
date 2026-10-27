# OctoCAT Supply Chain Management Application – General Copilot Instructions

These are repository-wide guidelines. Path‑scoped files in `.github/instructions/*.instructions.md` provide focused guidance for specific areas (frontend, API, database).

## High-Level Architecture
Multi-language monorepo under `src/` implementing the OctoCAT Supply Chain app. It ships FOUR interchangeable implementations of the same OctoCAT Supply API plus a shared UI and database:
- `src/api-ts` Express REST API in TypeScript (SQLite persistence, repository pattern, Swagger docs)
- `src/api-cs` ASP.NET REST API in C#
- `src/api-py` FastAPI REST API in Python
- `src/api-java` Spring Boot REST API in Java
- `src/frontend` React + Vite + Tailwind UI (shared across all API variants)
- `src/database` SQLite schema — `src/database/migrations/` and `src/database/seed/`
- `src/Makefile` orchestrates install/build/test/dev across the languages

Refer to `src/docs/architecture.md`, `src/docs/sqlite-integration.md`, and `src/docs/system-overview-and-deployment.md` for deeper details. Avoid restating them in reviews and link instead.

## General Review Guidance
When generating suggestions:
1. Prefer incremental, minimal diffs; preserve existing style and naming.
2. Surface security, correctness, and data integrity issues before micro-optimizations.
3. Encourage type safety (no `any` unless justified). Suggest adding/refining model or DTO types when gaps appear.
4. Reduce duplication: when the same logic appears in multiple places, suggest extracting it into a shared utility or repository method.
5. Ensure error handling uses existing custom error types where appropriate (e.g., NotFound, Validation, Conflict) and propagates consistent HTTP status codes via middleware.
6. Encourage tests: request unit tests for new repository logic and component tests (or at least React Testing Library coverage) for critical UI paths.
7. For performance concerns, highlight N+1 query patterns, unnecessary data loading, or large bundle additions.
8. Prefer environment variable driven configuration; avoid hard‑coded paths/secrets.

## Monorepo Workflow
- Build and test via the `src/Makefile` (run targets from `src/`): `make build` / `make test` run the TypeScript API and frontend. Per-language targets scope to one implementation: `build-<lang>`, `test-<lang>`, `dev-<lang>` (API plus frontend), and `dev-api-<lang>` (API only), where `<lang>` is `ts`, `cs`, `py`, or `java`. `make dev` starts the TypeScript API and frontend.
- Install dependencies with the install targets: `make install` (everything) or per-language `make install-ts`, `make install-cs`, `make install-py`, `make install-java`, `make install-frontend`.
- For a local frontend preview, run it as a Docker container from the repository root instead of using `npm run dev`:
  ```sh
  docker build -t octocat-frontend ./src/frontend
  docker run --rm --name octocat-frontend -p 8080:80 \
    -e API_HOST=host.docker.internal \
    -e API_PORT=3000 \
    -e API_PROTOCOL=http \
    octocat-frontend
  ```
  Open `http://localhost:8080`; stop an existing `octocat-frontend` container with `docker stop octocat-frontend` before starting its replacement. Set `API_HOST` to a hostname reachable from the container when the API runs in Docker. Stop the foreground container with Ctrl+C and rebuild the image after frontend source changes. Continue to use the npm scripts for linting, tests, and build validation.
- Keep PRs scoped: code + tests + docs (architecture or build notes) when behavior changes.
- Update related instruction files if new folders or architectural slices are introduced.
- Python API (`src/api-py`): run it from that directory, because migrations and seeds resolve relative to the current working directory. It requires Python 3.10+; the local `.venv` uses 3.12.
- Keep `.github/state.md` current at the end of substantive work: status, decisions, open items, and next steps.

## Conventions and Patterns

### Naming
- API JSON fields are camelCase (`productId`, `supplierId`, `imgName`). Database columns are snake_case (`product_id`). Map between them in the repository layer (`_map_row`), not in routes.
- REST paths are plural, kebab-case resources under `/api/` (for example `/api/order-details`).
- Python modules and functions are snake_case. Routes and repositories are named by plural resource (`products.py`); models are singular (`product.py`). Request models are `Create<Entity>Request` and `Update<Entity>Request`.
- Frontend component files are PascalCase (`Products.tsx`) and export React components as default. TypeScript interfaces use the same field names as the API.

### Patterns
- Python API: keep routes thin. Put SQL in `repositories/<resource>.py`, use `?` placeholders (never string formatting), and raise the shared exceptions in `utils/errors.py` (`NotFoundException`, `ValidationException`, `DatabaseException`).
- Python API: start modules with `from __future__ import annotations`, and use `async` routes and repositories with `get_connection()`.
- Frontend: build API URLs from `api.baseURL` and `api.endpoints` in `src/api/config.ts`. Do not hardcode hosts.
- Frontend: fetch server data with React Query `useQuery`, keyed by resource name. Use Tailwind for styling and `useTheme` for dark mode.
- Frontend: always use braces on `if`/`for` bodies (the ESLint `curly: all` rule).
- Deployment config comes from `window.RUNTIME_CONFIG` or environment variables, not build-time constants.

### Known defects, not patterns
- The loop in [Products.tsx](../src/frontend/src/components/entity/product/Products.tsx) has a wrong increment and bound. Do not copy it; fix it when touching that file.

## Do Not Repeat
Do not inline full API route or component files in review feedback unless absolutely necessary: quote only the lines requiring change. Summarize low‑impact nits.

## Escalation Order for Suggestions
1. Security / data integrity
2. Logical / functional correctness
3. Performance / scalability
4. Maintainability / duplication
5. Readability / consistency
6. Style / minor formatting

## Tone & Feedback Style
Be concise, actionable, and cite a rationale ("because" clause) for non-trivial recommendations. Offer one preferred solution; optionally a lightweight alternative.

---
If new subsystems are added (e.g., `mobile/`, `worker/`), create a new `*.instructions.md` with `applyTo` globs instead of bloating this file.
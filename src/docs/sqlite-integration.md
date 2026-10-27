# SQLite integration

The Python and C# APIs use SQLite for persistence and share the SQL schema in
`src/database/`. Each API initializes its database at startup by applying
pending migrations and, when the supplier table is empty, the ordered seed
files.

## Schema and migrations

The core tables are:

- `suppliers`, `headquarters`, and `branches`
- `products`
- `orders` and `order_details`
- `deliveries` and the `order_detail_deliveries` join table
- `migrations`, which records applied migration filenames and versions

Additional migrations add supplier status fields, checkout receipts, discount
codes, and order discount snapshots. Migration files are sorted by filename and
recorded in `migrations`, so an already-applied file is not applied again.
Review the SQL files in `database/migrations/` and `database/seed/` for the
authoritative schema and demo data.

## Startup paths and database file

Run each API from its own directory so its relative paths resolve:

```sh
cd src/api-py
./.venv/bin/python -m uvicorn main:app --reload --port 3000
```

The C# API is similarly run from `src/api-cs`, or together with the frontend
from `src/` using `make dev-cs`.

The default database filename is `./data/app.db`, relative to the API process's
working directory. Set `DB_FILE` to select another file or `:memory:` for an
in-memory database:

```sh
cd src/api-py
DB_FILE=/tmp/octosupply-demo.db ./.venv/bin/python -m uvicorn main:app --port 3000
```

The API creates the parent directory when needed. The Python and C# providers
enable SQLite foreign keys, write-ahead logging, and a 30-second busy timeout.
The demo deployment stores this file on the container filesystem; it is not
durable across container replacement.

## Migration and seed locations

When started from `src/api-py/` or `src/api-cs/`, both APIs resolve the shared
files from `../database/migrations/` and `../database/seed/`. `DB_MIGRATIONS_DIR`
can override the migrations directory. Seed files remain resolved relative to
the API working directory.

Do not edit an existing migration that may already have been applied. Add a
new, ordered SQL migration for schema changes, and update the API repository
logic and tests as required. The migrations are shared by both API tracks.

## Transactions and safety

Both APIs use parameterized SQL for database operations. Startup migration and
seed scripts run in transactions. The Python checkout implementation creates
the order, order lines, discount snapshot, and idempotency receipt transactionally;
the receipt protects replay behavior after an uncertain network response.

Use an isolated `DB_FILE` for local experiments and tests. Do not copy or edit
the deployed demo database as a backup strategy: the Azure container filesystem
is ephemeral. Real production persistence and backup/restore are outside this
demo's current design.

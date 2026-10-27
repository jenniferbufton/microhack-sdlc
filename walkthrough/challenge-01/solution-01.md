# Walkthrough Challenge 1 - Dev environment & repo overview

**[Home](../../Readme.md)** - [Next Challenge Solution](../challenge-02/solution-02.md)

Duration: 30 minutes

## Prerequisites

Please ensure you have satisfied the [General prerequisites](../../Readme.md#general-prerequisites) before continuing.

## Approach

The aim here is a smooth, fast start — a good setup means the rest of the day goes into building, not fighting toolchains.

### Task 1: Get the code and open an environment

- Open your team's copy of this MicroHack in **GitHub Codespaces** (fastest, nothing to install), a local **VS Code Dev Container**, or locally.
- 💡 If local setup takes more than ~15 minutes, **switch to Codespaces** rather than fighting a local toolchain.
- Confirm you're on the intended working branch.

### Task 2: Verify runtimes and enable Copilot

- In Codespaces / the Dev Container, Node.js 24, Python 3.13, .NET 10, and Java 17 are preinstalled. This checkout includes Python and C# API tracks; locally, install the runtime for your chosen track plus Node.js.
- Sign in to GitHub Copilot in the IDE. **Proof that it works** is a real Chat response about a file you have open — not just the extension being installed. If suggestions are empty, sign out/in, confirm your seat is assigned, and open a real source file so the agent has context.

### Task 3: Explore the repo

- 🔑 The quickest way to satisfy this is to **ask Copilot Chat to summarise the repository structure and the main entry points**.
- Identify: `src/` (the React frontend, Python and C# APIs, shared SQLite schema, and `src/docs/`), `infra/` + `scripts/` (Azure deployment), `assets/` (Challenge 3 backlog & WorkIQ inputs), `.github/` (Copilot custom instructions & agents). Read `src/README.md`.

### Task 4: Run the app locally

- Start the frontend and one API with a track-specific target such as `make dev-py` (see `src/README.md`). Avoid the default `make dev` target in this checkout; it still points at the removed TypeScript API.
- Choose Python or C# for the API exercises; the later agentic practices are not tied to a particular language.

## Optional stretch — repo-wide agent context

Create an `AGENTS.md` and/or `.github/copilot-instructions.md` with:
- **Conventions** — concrete, repo-specific rules (naming, repository pattern, DTO/type usage), not generic advice.
- **Validation commands** — the exact build/test commands for your track and the frontend.
- **Scope rules** — explicit "do not touch" boundaries (generated files, infra, unrelated services).

Then, in a **fresh** Copilot Chat, ask something that relies on a convention **without restating it** and confirm the instructions were applied. This pays off directly in Challenges 2–4.

You successfully completed challenge 1! 🚀🚀🚀

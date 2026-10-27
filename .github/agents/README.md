# Custom agents — `.github/agents/`

This folder holds **custom agents** for the repo. This README is a short "anatomy of a custom agent" so you can read one, use one, and build your own — the working example here is [`requirement-refiner.agent.md`](requirement-refiner.agent.md), built for the Challenge 3 requirement-refinement stretch.

## What is a custom agent?

A custom agent is a reusable chat persona: a set of **instructions** plus a scoped list of **tools** that the AI adopts when you switch to it. Instead of re-explaining a role and hand-picking tools every time, you save the configuration once and select it whenever you need it.

- **Where they live:** workspace agents are Markdown files with the `.agent.md` extension in `.github/agents/`. VS Code detects them automatically.
- **Where you use them:** the Copilot Chat **agent dropdown** in VS Code, and — because the same file is portable — in the **GitHub Copilot App / CLI** (background agents) and **cloud agents**.
- **Why bother:** a focused agent gives more consistent results, and a scoped tool list keeps it safe (least privilege) and cheaper (less context, fewer stray tool calls).

## Frontmatter fields

A custom agent is YAML frontmatter (the config) followed by a Markdown body (the system prompt). The common frontmatter fields:

| Field | What it does |
| --- | --- |
| `description` | Short summary of the agent; shown as placeholder text in the chat input. |
| `name` | Display name in the agent dropdown. Defaults to the file name if omitted. |
| `argument-hint` | Optional hint telling the user what to type to get started. |
| `tools` | The tools / tool-sets the agent may use. Keep it minimal — least privilege. |
| `model` | Optional model to run with. **Omit** to use whatever model the user has selected. |
| `handoffs` | Optional next-step buttons that transition to another agent with pre-filled context. |
| `target` | Optional surface (`vscode` or `github-copilot`). **Omit** for the default VS Code surface. |

Only `tools` and the body really shape behaviour; everything else is presentation or portability. Fields are optional — when in doubt, leave one out.

## How this example is built

[`requirement-refiner.agent.md`](requirement-refiner.agent.md) maps to those fields like this:

- **`name: Requirement Refiner`** — what you pick from the agent dropdown.
- **`description`** — one line so you know what it's for before selecting it.
- **`argument-hint`** — nudges you to point it at `assets/workiq/` to start.
- **`tools: ['codebase', 'search', 'web', 'edit', 'github-remote/search_issues', 'github-remote/create_issue']`** — a read-only analysis core plus human-approved backlog and issue writes. The body restricts `edit` to appending one non-duplicate requirement to `assets/backlog.md`, matching its format and preserving existing entries. This path restriction is an instruction, not enforcement built into the edit tool. Application-code edits and command execution remain prohibited, and no terminal tool is enabled. The two named GitHub tools allow issue search and creation without granting the whole server's capabilities.
- **Write access ≠ autonomy.** Granting `create_issue` doesn't mean the agent files issues on its own. The body pairs that capability with a **mandatory human-confirmation step**: it confirms the need, title, labels, and target repo, and creates **exactly one** issue only after an explicit yes — with a paste-ready-markdown fallback if the MCP server isn't available. A write tool in `tools` and a human-in-the-loop instruction in the body are two halves of the same guardrail.
- **Referencing MCP tools.** In `tools`, an MCP tool is written as `<serverName>/<toolName>` (e.g. `github-remote/create_issue`); `<serverName>/*` would include *all* of that server's tools. Here `github-remote` is the hosted GitHub MCP server preconfigured in [`.vscode/mcp.json`](../../.vscode/mcp.json) with the `issues` toolset, so `create_issue` and `search_issues` are available without any extra setup.
- **`model` is omitted** on purpose, so it runs with whatever model you've selected (no dependency on a model name that might not exist in your environment).
- **The body** is the system prompt: a **Role**, the **Inputs** it may read, a numbered **Process**, a fixed **Output format** (the "Requirement brief"), and explicit **Guardrails**. The clear headings aren't just for humans — a well-structured prompt gives the agent a reliable routine to follow.

## How to use it

1. Open **Copilot Chat** in VS Code.
2. Select **Requirement Refiner** from the agent dropdown.
3. Give it a starting prompt, e.g. _"Refine a requirement from the signal in `assets/workiq/`."_
4. Work through the refinement with it — confirm the need it proposes, then let it draft the **Requirement brief**. You can explicitly ask it to append the requirement to `assets/backlog.md`; it checks for duplicates and preserves the existing format and entries. Separately, it can render a paste-ready GitHub issue or, after the issue-specific confirmations, **file the issue for you** via the `github-remote` MCP server. Backlog approval does not authorize filing an issue. Building the feature stays your job.

## Build your own

1. Create `.github/agents/<name>.agent.md`.
2. Add frontmatter — at minimum a `name` and `description`, plus a **minimal** `tools` list (only what the task needs).
3. Write the instruction body: define the role, the process, and any output format and guardrails. Use clear headings.
4. Reload/open Copilot Chat and select your agent from the dropdown to try it.

> Tip: match the tools to the job. Prefer read-only by default — an analysis or advisory agent usually needs nothing more. When a task genuinely needs a write action, scope it to the **minimum** tools (not a whole MCP server) and keep a **human in the loop**. This example allows backlog-only edits by instruction and separately confirmed issue creation. Use a tool hook if you need deterministic enforcement of file-path restrictions.

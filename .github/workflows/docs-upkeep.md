---
name: Documentation upkeep
description: Audit user-facing documentation against the current repository and propose a reviewed docs-only update.
on:
  schedule:
    - cron: "weekly on monday"
  workflow_dispatch:
permissions:
  contents: read
  pull-requests: read
  copilot-requests: write
concurrency:
  group: docs-upkeep
  cancel-in-progress: false
strict: true
engine: copilot
imports:
  - .github/agents/documentation-maintainer.agent.md
tools:
  github:
    toolsets:
      - repos
network:
  allowed: []
safe-outputs:
  report-incomplete: false
  create-pull-request:
    title-prefix: "[docs-upkeep] "
    branch-prefix: "automation/"
    preserve-branch-name: true
    base-branch: main
    draft: true
    max: 1
    max-patch-files: 20
    max-patch-size: 512
    allowed-files:
      - "Readme.md"
      - "src/README.md"
      - "src/api-cs/README.md"
      - "src/api-py/README.md"
      - "src/frontend/README.md"
      - "src/docs/*.md"
      - "src/docs/**/*.md"
      - "infra/README.md"
      - "scripts/README.md"
      - "challenges/**/*.md"
      - "walkthrough/**/*.md"
---

Review the user-facing documentation in this repository for stale or inaccurate
statements. Ground every proposed change in the checked-out source tree, package
manifests, Dockerfiles, infrastructure templates, and deployment workflow. Prefer
small corrections to broad rewrites.

The current checkout is the source of truth. Some repository instruction files
may describe removed API tracks; do not copy those claims into user-facing docs.
Do not edit instruction/configuration files to resolve a conflict. If an
important claim cannot be verified or instructions materially conflict, stop
without opening a pull request and explain the limitation in the run summary.

Only propose edits to user-facing Markdown paths allowed by the safe-output
configuration. Do not change application code, tests, workflows, agent
instructions, `AGENTS.md`, `.github/state.md`, backlog/assets, generated files,
or any other path. Keep relative links valid and preserve the existing voice.

Validate changed claims against current commands and configuration. Run relevant
existing checks when their dependencies are available; do not use aggregate Make
targets that reference absent API tracks. Check local Markdown links in changed
files where practical. Do not claim a check passed if it was not run. If no
material, evidence-backed documentation drift is found, make no changes and do
not open an empty pull request.

When there are actionable changes, propose exactly one draft pull request with
the branch name `docs-upkeep` (the configured prefix makes it
`automation/docs-upkeep`) and a concise summary of the verified drift, files
changed, and checks performed. Never merge the pull request; human review and
merge are required. This workflow has only scheduled and manual triggers, so
its own pull request updates do not trigger another run.

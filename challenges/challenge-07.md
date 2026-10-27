# Challenge 7 - Implement agentic workflows to maintain the app

**[Home](../Readme.md)** - [Previous Challenge](challenge-06.md) - [Next Challenge](finish.md)

## Goal

Use **GitHub Agentic Workflows** to help maintain the Octocat Supply application over time. This checkout includes a low-risk documentation-upkeep workflow as a reference; inspect its guardrails, run it against a real documentation issue, and review its proposed change before trusting it.

## Actions

* **Inspect the reference workflow** — Review [`.github/workflows/docs-upkeep.md`](../.github/workflows/docs-upkeep.md), its imported [documentation-maintainer agent](../.github/agents/documentation-maintainer.agent.md), and the compiled lock file. The workflow sets the triggers and safety boundaries; the reusable agent supplies documentation-audit guidance.
* **Validate the workflow** — With `gh-aw` installed, run `gh aw compile docs-upkeep` and inspect the generated Actions workflow. The agent job is read-only; safe output can create at most one draft PR on a dedicated branch and only for the allowlisted documentation paths.
* **Test the workflow** — Dispatch it against a branch containing a real, evidence-backed documentation discrepancy. If no discrepancy exists on the default branch, use a temporary test branch with a deliberately stale sentence; do not introduce test drift on the default branch.
* **Review and clean up** — Inspect the draft PR, confirm every claim against the source, verify it changes only allowed Markdown, then close the test PR without merging. Human review and merge are required for real documentation changes.

## Success criteria

* The documentation-upkeep workflow compiles and completes a manually dispatched run.
* The workflow has weekly and manual triggers, read-only agent permissions, a strict file allowlist, and draft-PR-only writes.
* A real documentation discrepancy produces a draft PR, or the workflow safely reports no actionable drift.
* The proposed output is checked for factual accuracy, allowed paths, and human review before merge.

### Optional stretch — package a reusable skill / slash command

* Pick a repeatable flow you've done by hand (e.g. "read instructions → scaffold tests → run validation").
* Package it as a reusable **skill or slash command** so it can be invoked in one step.
* Invoke it against a real task and confirm it performs the steps.
* Document where **human review stays mandatory** (e.g. before merging generated tests or committing changes).

## Learning resources

* [GitHub Agentic Workflows (gh-aw)](https://github.com/githubnext/gh-aw)
* [About GitHub Actions](https://docs.github.com/en/actions/learn-github-actions)
* [Controlling permissions for GITHUB_TOKEN](https://docs.github.com/en/actions/security-guides/automatic-token-authentication#permissions-for-the-github_token)

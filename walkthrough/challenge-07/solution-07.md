# Walkthrough Challenge 7 - Documentation upkeep

**[Home](../../Readme.md)** - [Previous Challenge Solution](../challenge-06/solution-06.md) - [Finish](../../challenges/finish.md)

Duration: 30 minutes

## Prerequisites

Complete [Challenge 6](../challenge-06/solution-06.md). Confirm GitHub Agentic
Workflows and the Copilot engine are enabled for the repository or organization.
Install the `gh-aw` GitHub CLI extension before compiling the workflow.

## Workflow design

The repository's low-risk maintenance task is checking user-facing documentation
against the current source tree. The workflow imports the reusable
[documentation-maintainer agent](../../.github/agents/documentation-maintainer.agent.md)
for evidence-based review guidance; the workflow itself sets the task scope,
tools, triggers, and safe outputs. The authoring source is
[`.github/workflows/docs-upkeep.md`](../../.github/workflows/docs-upkeep.md);
the compiled GitHub Actions file is
[`.github/workflows/docs-upkeep.lock.yml`](../../.github/workflows/docs-upkeep.lock.yml).

The workflow:

- Runs weekly on Monday and can also be dispatched manually.
- Gives the agent read-only repository access. A separate safe-output job can
  create at most one draft pull request.
- Restricts proposed changes to an allowlist of user-facing Markdown files;
  source code, workflows, agent instructions, backlog data, and generated files
  are outside its scope.
- Uses the dedicated `automation/docs-upkeep` branch and targets `main`.
- Has no pull-request trigger, so updating its own PR does not start another run.
- Requires human review and merge. It does not merge or push directly to `main`.

The prompt requires the agent to ground corrections in repository files, run
relevant available checks, and report checks honestly. If there is no verified
documentation drift, the expected result is a no-op rather than an empty PR.

## Compile and inspect

From the repository root, compile the source and inspect the generated workflow:

```sh
gh aw compile docs-upkeep --gh-aw-ref 32ecafbc061c9af57e9361942099e381102ae304 --strict --validate
```

This is the immutable commit SHA for the audited `gh-aw` v0.93.5 release, which
is pinned in the generated workflow. When intentionally upgrading, audit the
new release and use its commit SHA.
Commit the source and generated lock file together. Confirm the lock file keeps
the weekly and manual triggers, read-only agent permissions, draft-PR safe
output, strict documentation allowlist, and no direct default-branch write path.

## Run and review

After the workflow is available on the default branch, open **Actions →
Documentation upkeep → Run workflow** and dispatch it. To verify a positive
maintenance case when `main` has no actionable drift, use a temporary branch
with one deliberately stale, user-facing Markdown statement. Do not put test
drift on `main`.

Review the resulting draft PR before considering the run successful:

1. Confirm every changed claim against source code, manifests, Dockerfiles,
   infrastructure, or the deployment workflow.
2. Confirm all changed paths are allowed user-facing Markdown and no generated,
   code, instruction, or backlog file is included.
3. Check relative links and the reported validation results.
4. Close the test-only PR without merging and remove its test output branch when
   it is no longer needed. Real documentation changes still require normal
   human review and merge.

If GitHub does not expose the workflow or dispatch fails, verify that the
compiled lock file is on the default branch, the repository allows the
required GitHub Actions and Copilot workflow features, and the actor has
permission to dispatch workflows. Do not treat compilation alone as proof of
a successful hosted run.

You successfully completed challenge 7 when the workflow compiles, a manual
run is observed, and any proposed documentation update has been reviewed for
accuracy and scope.

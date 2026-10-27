---
name: Documentation Maintainer
description: Use when auditing or updating user-facing documentation against a repository's current implementation.
---

# Documentation Maintainer

Audit and improve user-facing documentation using evidence from the checked-out
repository. Prefer small, precise corrections that preserve the existing voice.

## Evidence and accuracy

- Verify claims against the implementation, tests, package manifests, build
  scripts, Dockerfiles, infrastructure, and deployment workflows as relevant.
- Treat the current checkout as the source of truth when older documentation
  or instructions conflict with it.
- Do not infer behavior or invent commands. If a material claim cannot be
  verified, call out the uncertainty instead of presenting it as fact.
- Distinguish platform capabilities from application features and business
  APIs; use precise terminology.

## Scope and review

- Edit only user-facing Markdown explicitly within the task's scope. Respect
  any caller-provided path allowlist.
- Do not change application code, tests, agent instructions, configuration, or
  generated files as part of a documentation-only task.
- Keep relative links valid and preserve useful, accurate existing content.
- Report the files changed and only the checks actually performed. If there is
  no material, evidence-backed change to make, recommend a no-op.

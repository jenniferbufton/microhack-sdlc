# Walkthrough Challenge 6 - Monitor with the Azure SRE Agent

**[Home](../../Readme.md)** - [Previous Challenge Solution](../challenge-05/solution-05.md) - [Next Challenge Solution](../challenge-07/solution-07.md)

Duration: 30 minutes

## Prerequisites

Complete [Challenge 5](../challenge-05/solution-05.md) — you need a **reachable deployment**. No deploy? Pair with another team or use a shared reference environment so you can still practise the loop. Confirm the **Azure SRE Agent** is available in your region/subscription and accessible to you.

## Approach

Move from build to operate. The learning is in the **detect → diagnose → remediate** loop — get the agent connected fast so there's time to actually reach the diagnosis step.

Suggested pacing:

```
Enable/confirm observability             ~7 min
Connect the SRE Agent                    ~7 min
Simulate a fault                         ~5 min
Investigate with the agent               ~7 min
Remediate + confirm healthy              ~4 min
```

### Task 1: Enable/confirm observability

- Start with the signals already configured by this checkout: Container Apps
  logs are sent to Log Analytics, Azure Monitor exposes platform metrics, and
  the API and frontend have basic liveness/readiness probes against `/`. The API
  root route is only a responsiveness check; it does not verify database health.
- The APIs do not expose a telemetry `/metrics` endpoint (such as Prometheus)
  or configure OpenTelemetry/tracing. Their business metrics routes are not
  application telemetry. Add instrumentation only if the exercise needs
  signals beyond the platform metrics and logs. See the
  [observability guide](../../src/docs/observability.md) for the current
  boundaries.

### Task 2: Connect the SRE Agent

- Connect the Azure SRE Agent to the **correct deployed resources / resource group** so it can observe application health and report status. Permissions errors usually mean the agent needs extra roles on the monitored resources.

### Task 3: Simulate a clear fault

- 💡 In a disposable, non-production environment, pick a reversible fault that
  clearly affects health, such as a controlled bad deploy. Avoid changing
  credentials or shared production configuration.

### Task 4: Investigate with the agent

- 🔑 Let the **agent** surface and diagnose the issue and suggest remediation — the goal is agent-assisted diagnosis, not you spotting it manually. Capture **what the agent surfaced vs. what you had to investigate yourself**.

### Task 5: Remediate and confirm

- Apply the fix, verify the probes and application are healthy again, and check
  what the agent reports. Note reliability gaps as backlog items — a natural
  feed into Challenge 7.

> No optional stretch. Fast finishers should document agent-caught vs. manually-investigated findings and turn reliability gaps into backlog items.

You successfully completed challenge 6! 🚀🚀🚀

# Challenge 6 - Monitor the deployed app with the Azure SRE Agent

**[Home](../Readme.md)** - [Previous Challenge](challenge-05.md) - [Next Challenge](challenge-07.md)

## Goal

Use agents to monitor the deployed Octocat Supply application and improve its reliability, leveraging the **Azure SRE Agent**. Now that the app is deployed, the team wants agentic monitoring — detect, diagnose, and help remediate issues.

> This challenge depends on a reachable deployment from Challenge 5. If your team doesn't have one, pair with another team or use a shared reference deployment so you can still practise the loop.

## Actions

* **Enable observability** — Confirm the deployed app's logs, Azure Monitor platform metrics, and health probes are available. This checkout forwards Container Apps logs to Log Analytics and configures basic root-path probes; it does not include a telemetry `/metrics` endpoint (such as Prometheus) or OpenTelemetry instrumentation. Add application-level telemetry if the exercise needs richer signals.
* **Set up the SRE Agent** — Connect the Azure SRE Agent to the deployed resources so it can observe application health.
* **Simulate an issue** — Introduce or trigger a fault (e.g. a failing dependency or a bad deploy) that clearly affects health.
* **Investigate with the agent** — Use the SRE Agent to identify root cause and suggest remediation.
* **Remediate** — Apply the fix and confirm the agent reports healthy status.

## Success criteria

* The monitoring signals selected for the exercise are available to the SRE Agent; add application-level telemetry if the existing platform signals are not sufficient.
* The Azure SRE Agent is monitoring the application.
* An induced issue is detected and diagnosed with agent assistance (not just noticed manually).
* The issue is remediated and health is restored.

> Capture **what the agent surfaced vs. what you had to investigate manually**, and note reliability improvements to feed back into the backlog.

## Learning resources

* [Azure SRE Agent documentation](https://learn.microsoft.com/en-us/azure/sre-agent/)
* [Azure Monitor overview](https://learn.microsoft.com/en-us/azure/azure-monitor/overview)
* [Health probes in Azure Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/health-probes)

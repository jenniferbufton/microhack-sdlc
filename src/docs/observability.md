# Application observability

This guide describes the observability that is actually configured in the
current OctoSupply checkout. It does not configure an observability framework
or add application instrumentation.

## Health probes

The Azure Container Apps template configures HTTP readiness and liveness probes
against `/` on each container's listening port. Both APIs respond to `/` with a
basic greeting; the frontend container serves its static application at `/`.
These probes confirm HTTP responsiveness, not database health or end-to-end
availability.

## Logs

The Azure deployment sends Container Apps logs to its Log Analytics workspace.
Use Azure Container Apps and Log Analytics tools to inspect startup messages,
migration output, application errors, and container restarts. The deployment
template sets the workspace and log retention; see the
[Azure deployment guide](../../infra/README.md).

For a deployed-app exercise, the [Challenge 6 walkthrough](../../walkthrough/challenge-06/solution-06.md)
describes using the Azure SRE Agent to investigate an issue.

## Not currently configured

The APIs do not include the previously described TAO package, a telemetry
`/metrics` endpoint (such as Prometheus), OpenTelemetry instrumentation, or
distributed tracing. They do have business metrics routes, which are not
application telemetry. Do not assume telemetry metrics or traces are available
to dashboards or the SRE Agent. Adding them would require an application and
infrastructure change, not just configuration.

The API is unauthenticated, and CORS is not an access-control boundary. The
Azure demo uses ephemeral SQLite storage and simulated checkout; it is not a
production deployment.

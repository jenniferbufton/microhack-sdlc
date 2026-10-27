# Azure deployment

The Bicep templates and [GitHub Actions workflow](../.github/workflows/deploy.yml)
deploy the current Python API and React frontend to Azure Container Apps.

## Architecture

- **Azure Container Registry** stores the API and frontend images. Its admin
  account and anonymous pulls are disabled.
- **Container Apps** runs the Python API on port 3000 and the frontend's nginx
  container on port 80. Both apps use external HTTPS ingress.
- The frontend's runtime configuration points browsers directly to the API's
  HTTPS FQDN. The API's `API_CORS_ORIGINS` is restricted to the frontend origin.
- **Log Analytics** receives Container Apps logs.
- Each app uses a user-assigned identity to pull images from ACR. Bicep grants
  the `AcrPull` role before creating the app; the deployment identity needs
  permission to create those role assignments.

The API currently stores its database in SQLite. The demo deployment uses the
container filesystem, sets the API maximum replica count to one, and does not
provide durable storage. Orders and receipts can be lost when a container or
revision is replaced. Do not use this deployment for production data. The demo
checkout is enabled with the mock payment provider and does not process real
payments. The API has no authentication; CORS is not an access-control boundary.

## Templates

| File | Purpose |
| --- | --- |
| `registry.bicep` | Creates the ACR before the workflow builds and pushes images. |
| `main.bicep` | Creates or updates ACR, Log Analytics, the Container Apps environment, and both apps. |
| `modules/registry.bicep` | ACR with admin and anonymous access disabled. |
| `modules/loganalytics.bicep` | Log Analytics workspace with configurable retention. |
| `modules/containerapp-env.bicep` | Consumption Container Apps environment. |
| `modules/containerapp.bicep` | Container App with health probes, a user-assigned pull identity, and ACR pull permissions. |
| `main.parameters.json` | Non-secret deployment defaults; the workflow supplies the image tags and Azure region. |

`namePrefix` is normalized for resource names, must be 2–12 characters, and
should be chosen so the derived ACR name is globally unique. `environmentName`
is `dev` in the workflow. The Bicep deployment outputs `frontendUrl`, `apiUrl`,
`acrName`, and `acrLoginServer`.

## GitHub Actions setup

The workflow validates pull requests, then deploys on pushes to `main` and on
manual dispatch from `main`. It builds images tagged with the commit SHA, uses
`az deployment group what-if`, deploys the Bicep templates, and smoke-checks the
frontend, seeded API products, and exact CORS origin.

Create a GitHub Actions environment named `azure-dev`, then configure:

**Environment secrets**

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

**Environment variables**

- `AZURE_RESOURCE_GROUP`
- `AZURE_LOCATION`
- `AZURE_NAME_PREFIX` — 2–12 lowercase letters or digits; choose a globally unique ACR name.

Configure an Azure workload identity federation credential for the repository
and environment with subject:

```text
repo:<owner>/<repo>:environment:azure-dev
```

The workflow creates the resource group if it does not exist. To permit that,
the identity needs `Microsoft.Resources/subscriptions/resourceGroups/read` and,
when creating it, `Microsoft.Resources/subscriptions/resourceGroups/write` at
the subscription scope. After the group exists, it needs `Contributor` and
`AcrPush` at the resource-group scope to deploy resources and publish images.
It also needs `User Access Administrator` at the resource-group scope so Bicep
can grant the Container Apps identities `AcrPull`. For a new resource group,
bootstrap these role assignments through an Azure administrator or provide
equivalent scoped permissions at the parent scope. Prefer a dedicated identity
and the narrowest workable scope. No client secret or ACR admin password is
stored in GitHub.

## Local validation

From the repository root:

```sh
docker build -f src/api-py/Dockerfile -t octocat-api:local .
docker build -t octocat-frontend:local src/frontend
```

From `src/`:

```sh
make test-py build-py
cd frontend
npm ci
npm run lint
npm run build
```

Validate the templates with Azure CLI:

```sh
az bicep build --file infra/registry.bicep --stdout >/dev/null
az bicep build --file infra/main.bicep --stdout >/dev/null
```

The GitHub workflow performs the registry-first deployment so images exist in
ACR before the Container Apps are created. Run it only after the OIDC identity
and GitHub environment values are configured.

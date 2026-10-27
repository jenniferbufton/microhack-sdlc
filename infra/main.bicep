targetScope = 'resourceGroup'

@description('Azure region for all resources. Defaults to the resource group location.')
param location string = resourceGroup().location

@description('Short lowercase prefix. Choose a value that makes the resulting registry name globally unique.')
@minLength(2)
@maxLength(12)
param namePrefix string = 'octocat'

@description('Environment name used to derive resource names.')
@minLength(2)
@maxLength(8)
param environmentName string = 'dev'

@description('Container image reference for the API.')
param apiImage string

@description('Container image reference for the frontend.')
param frontendImage string

@description('Maximum frontend replicas.')
@minValue(1)
@maxValue(5)
param frontendMaxReplicas int = 3

@description('Log Analytics retention period.')
@minValue(30)
@maxValue(730)
param logRetentionInDays int = 30

var normalizedPrefix = toLower(replace(namePrefix, '-', ''))
var baseName = '${normalizedPrefix}-${environmentName}'
var registryName = toLower('${normalizedPrefix}${environmentName}acr')
var logAnalyticsName = '${baseName}-logs'
var environmentResourceName = '${baseName}-env'
var apiAppName = '${baseName}-api'
var frontendAppName = '${baseName}-frontend'
var frontendOrigin = 'https://${frontendAppName}.${environment.outputs.defaultDomain}'

var commonTags = {
  project: 'octocat-supply'
  challenge: 'challenge-05-azure-deploy'
  managedBy: 'bicep'
  environment: environmentName
}

module registry 'modules/registry.bicep' = {
  name: 'registry'
  params: {
    location: location
    registryName: registryName
    tags: commonTags
  }
}

module logAnalytics 'modules/loganalytics.bicep' = {
  name: 'loganalytics'
  params: {
    location: location
    workspaceName: logAnalyticsName
    retentionInDays: logRetentionInDays
    tags: commonTags
  }
}

module environment 'modules/containerapp-env.bicep' = {
  name: 'containerapp-env'
  params: {
    location: location
    environmentName: environmentResourceName
    logAnalyticsWorkspaceId: logAnalytics.outputs.workspaceId
    tags: commonTags
  }
}

module apiApp 'modules/containerapp.bicep' = {
  name: 'api-app'
  params: {
    location: location
    appName: apiAppName
    environmentId: environment.outputs.environmentId
    image: apiImage
    targetPort: 3000
    externalIngress: true
    registryName: registryName
    registryLoginServer: registry.outputs.loginServer
    minReplicas: 1
    maxReplicas: 1
    cpu: '0.5'
    memory: '1.0Gi'
    tags: commonTags
    env: [
      {
        name: 'DB_FILE'
        value: '/app/data/app.db'
      }
      {
        name: 'API_CORS_ORIGINS'
        value: frontendOrigin
      }
      {
        name: 'PAYMENT_PROVIDER'
        value: 'mock'
      }
      {
        name: 'PAYMENT_MOCK_ENABLED'
        value: 'true'
      }
      {
        name: 'PAYMENT_CURRENCY'
        value: 'USD'
      }
    ]
  }
}

module frontendApp 'modules/containerapp.bicep' = {
  name: 'frontend-app'
  params: {
    location: location
    appName: frontendAppName
    environmentId: environment.outputs.environmentId
    image: frontendImage
    targetPort: 80
    externalIngress: true
    registryName: registryName
    registryLoginServer: registry.outputs.loginServer
    minReplicas: 1
    maxReplicas: frontendMaxReplicas
    cpu: '0.25'
    memory: '0.5Gi'
    tags: commonTags
    env: [
      {
        name: 'API_HOST'
        value: apiApp.outputs.fqdn
      }
      {
        name: 'API_PORT'
        value: '443'
      }
      {
        name: 'API_PROTOCOL'
        value: 'https'
      }
    ]
  }
}

@description('Azure Container Registry name.')
output acrName string = registry.outputs.registryName

@description('Azure Container Registry login server.')
output acrLoginServer string = registry.outputs.loginServer

@description('Public URL of the frontend app.')
output frontendUrl string = 'https://${frontendApp.outputs.fqdn}'

@description('Public URL of the API app.')
output apiUrl string = 'https://${apiApp.outputs.fqdn}'

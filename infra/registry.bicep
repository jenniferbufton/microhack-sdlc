targetScope = 'resourceGroup'

@description('Azure region for the registry.')
param location string = resourceGroup().location

@description('Short lowercase prefix. Choose a value that makes the resulting registry name globally unique.')
@minLength(2)
@maxLength(12)
param namePrefix string

@description('Environment name used to derive resource names.')
param environmentName string = 'dev'

var registryName = toLower(replace('${namePrefix}${environmentName}acr', '-', ''))
var tags = {
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
    tags: tags
  }
}

@description('The registry name used by the GitHub Actions image-push stage.')
output registryName string = registry.outputs.registryName

@description('The registry login server.')
output loginServer string = registry.outputs.loginServer

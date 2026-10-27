@description('Azure region for the app.')
param location string

@description('Name of the Container App.')
param appName string

@description('Resource ID of the Container Apps managed environment.')
param environmentId string

@description('Fully-qualified image reference in the configured ACR.')
param image string

@description('The container listening port.')
param targetPort int

@description('Whether the app receives public ingress.')
param externalIngress bool = true

@description('ACR name used for managed-identity image pulls.')
param registryName string

@description('Login server of the configured ACR.')
param registryLoginServer string

@description('Container environment variables.')
param env array = []

@description('Tags applied to the app.')
param tags object = {}

@minValue(0)
param minReplicas int = 1

@minValue(1)
param maxReplicas int = 1

@description('CPU allocated to the container.')
param cpu string = '0.5'

@description('Memory allocated to the container.')
param memory string = '1.0Gi'

var acrPullRoleDefinitionId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' existing = {
  name: registryName
}

resource imagePullIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${appName}-acr-pull'
  location: location
  tags: tags
}

resource acrPullAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(containerRegistry.id, imagePullIdentity.id, acrPullRoleDefinitionId)
  scope: containerRegistry
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleDefinitionId)
    principalId: imagePullIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: appName
  location: location
  tags: tags
  dependsOn: [
    acrPullAssignment
  ]
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${imagePullIdentity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: environmentId
    configuration: {
      ingress: {
        external: externalIngress
        targetPort: targetPort
        transport: 'auto'
        allowInsecure: false
        traffic: [
          {
            weight: 100
            latestRevision: true
          }
        ]
      }
      registries: [
        {
          server: registryLoginServer
          identity: imagePullIdentity.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: appName
          image: image
          resources: {
            cpu: json(cpu)
            memory: memory
          }
          env: env
          probes: [
            {
              type: 'Readiness'
              httpGet: {
                path: '/'
                port: targetPort
                scheme: 'HTTP'
              }
              initialDelaySeconds: 5
              periodSeconds: 10
              timeoutSeconds: 5
              failureThreshold: 3
            }
            {
              type: 'Liveness'
              httpGet: {
                path: '/'
                port: targetPort
                scheme: 'HTTP'
              }
              initialDelaySeconds: 15
              periodSeconds: 30
              timeoutSeconds: 5
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
      }
    }
  }
}

@description('The fully-qualified domain name of the app.')
output fqdn string = containerApp.properties.configuration.ingress.fqdn

@description('The name of the container app.')
output appName string = containerApp.name

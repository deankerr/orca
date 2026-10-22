import type { MonitorScope } from '@orca/backend/monitor'
import { parseAsString, useQueryStates } from 'nuqs'

/** The most specific filter wins; a model and provider together select their pair. */
function monitorScope({
  model,
  provider,
  endpoint,
}: {
  model: string
  provider: string
  endpoint: string
}): MonitorScope {
  if (endpoint) {
    return { kind: 'endpoint', endpoint_id: endpoint }
  }
  if (model && provider) {
    return { kind: 'pair', model_id: model, provider_id: provider }
  }
  if (model) {
    return { kind: 'model', model_id: model }
  }
  return provider ? { kind: 'provider', provider_id: provider } : { kind: 'all' }
}

export function useMonitorFilters() {
  const [params, setParams] = useQueryStates(
    {
      model: parseAsString.withDefault(''),
      provider: parseAsString.withDefault(''),
      endpoint: parseAsString.withDefault(''),
    },
    { history: 'push', shallow: true },
  )

  const scope = monitorScope(params)

  return {
    scope,
    modelId: params.model ?? '',
    providerId: params.provider ?? '',
    endpointId: params.endpoint ?? '',
    setModelId: (id: string) => {
      void setParams({ model: id || null, endpoint: null })
    },
    setProviderId: (id: string) => {
      void setParams({ provider: id || null, endpoint: null })
    },
    setEndpointId: (id: string) => {
      void setParams({ endpoint: id || null, model: null, provider: null })
    },
    hasActiveFilters: scope.kind !== 'all',
  }
}

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
    return { endpoint_id: endpoint, kind: 'endpoint' }
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
      endpoint: parseAsString.withDefault(''),
      model: parseAsString.withDefault(''),
      provider: parseAsString.withDefault(''),
    },
    { history: 'push', shallow: true },
  )

  const scope = monitorScope(params)

  return {
    endpointId: params.endpoint ?? '',
    hasActiveFilters: scope.kind !== 'all',
    modelId: params.model ?? '',
    providerId: params.provider ?? '',
    scope,
    setEndpointId: (id: string) => {
      void setParams({ endpoint: id || null, model: null, provider: null })
    },
    setModelId: (id: string) => {
      void setParams({ endpoint: null, model: id || null })
    },
    setProviderId: (id: string) => {
      void setParams({ endpoint: null, provider: id || null })
    },
  }
}

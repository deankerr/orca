import type { MonitorScope } from '@orca/backend/convex/alerts/monitor/query'
import { parseAsString, useQueryStates } from 'nuqs'

export function useMonitorFilters() {
  const [params, setParams] = useQueryStates(
    {
      model: parseAsString.withDefault(''),
      provider: parseAsString.withDefault(''),
      endpoint: parseAsString.withDefault(''),
    },
    { history: 'push', shallow: true },
  )

  const scope: MonitorScope = params.endpoint
    ? { kind: 'endpoint', endpoint_id: params.endpoint }
    : params.model && params.provider
      ? { kind: 'pair', model_id: params.model, provider_id: params.provider }
      : params.model
        ? { kind: 'model', model_id: params.model }
        : params.provider
          ? { kind: 'provider', provider_id: params.provider }
          : { kind: 'all' }

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

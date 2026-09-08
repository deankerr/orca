import type { api } from '@orca/backend/convex/_generated/api'
import type { FunctionReturnType } from 'convex/server'

// Temporary series shape: values remain absent until pricing and stats are migrated.
const series: {
  pricing: Partial<
    Record<
      | 'text_input'
      | 'text_output'
      | 'cache_read'
      | 'cache_write'
      | 'audio_input'
      | 'audio_cache_read'
      | 'image_input'
      | 'image_output'
      | 'web_search',
      number
    >
  >
  stats?: { p50_throughput: number; p50_latency: number }
} = { pricing: {} }

/** Compose baseline query results into the transitional grid representation. */
export function buildGridEndpoints(
  endpoints: FunctionReturnType<typeof api.v3.public.endpoints.list>,
  models: FunctionReturnType<typeof api.v3.public.models.list>,
  providers: FunctionReturnType<typeof api.v3.public.providers.list>,
) {
  const modelsById = new Map(models.map((model) => [model.model_id, model]))
  const providersById = new Map(providers.map((provider) => [provider.provider_id, provider]))

  return endpoints.flatMap((endpoint) => {
    const model = modelsById.get(endpoint.model_id)
    const provider = providersById.get(endpoint.provider_id)

    // Temporarily omit incomplete joins rather than inventing nested entity identities.
    if (!model || !provider) {
      return []
    }

    if (!model.output_modalities.includes('text')) {
      return []
    }

    return [{ ...endpoint, model, provider, ...series }]
  })
}

export type GridEndpoint = ReturnType<typeof buildGridEndpoints>[number]

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

/** Add temporary series fields to the self-contained endpoint query result. */
export function buildGridEndpoints(
  endpoints: FunctionReturnType<typeof api.v3.public.endpoints.list>,
) {
  return endpoints.map((endpoint) => ({ ...endpoint, ...series }))
}

export type GridEndpoint = ReturnType<typeof buildGridEndpoints>[number]

import type { QueryClient, QueryKey } from '@tanstack/react-query'

import { readinessQueryTimings } from './query-timing'

/** Capture cache availability at user intent, before React schedules the requested view. */
export function startReadiness(
  client: QueryClient,
  queryKey: QueryKey,
  surface: 'grid' | 'overview_sheet',
) {
  const started = readinessQueryTimings.connection.mark()
  const query = client.getQueryCache().find({ queryKey, exact: true })

  return {
    id: crypto.randomUUID(),
    surface,
    started,
    queryKey,
    initial:
      query?.state.data === undefined
        ? undefined
        : readinessQueryTimings.initial(query.queryHash, started),
  }
}

export type ReadinessMeasurement = ReturnType<typeof startReadiness>

import type { QueryCache, QueryCacheNotifyEvent, QueryKey } from '@tanstack/react-query'
import * as R from 'remeda'
import { z } from 'zod'

import { captureTiming } from './capture'
import type { EmitTiming } from './capture'
import { ConnectionTimings } from './connection-timing'
import type { TimingMark } from './connection-timing'

type ReadinessQuerySource = 'tanstack_memory' | 'tanstack_persisted' | 'convex_client' | 'server'

export type ReadinessQueryTiming = {
  id: string
  source: ReadinessQuerySource
  available: TimingMark
  fetchStarted?: TimingMark
}

type PendingFetch = { started: TimingMark; source: ReadinessQuerySource }

const TIMED_QUERIES = new Set([
  'catalog/endpoints/query:grid',
  'catalog/stats/query:grid',
  'catalog/models/query:get',
  'catalog/providers/query:get',
])

/** Observe actual cache writes; elapsed time alone cannot identify a cache hit. */
export class ReadinessQueryTimings {
  private restored = new Set<string>()
  private readonly observed = new Set<string>()
  private readonly results = new Map<string, ReadinessQueryTiming>()
  private readonly fetches = new Map<string, PendingFetch>()

  private readonly emit: EmitTiming

  readonly connection: ConnectionTimings

  constructor(now = () => performance.now(), emit: EmitTiming = () => undefined) {
    this.emit = emit
    this.connection = new ConnectionTimings(now, emit)
  }

  markRestored(queryHashes: string[]) {
    this.restored = new Set(queryHashes)
  }

  initial(queryHash: string, started: TimingMark): ReadinessQueryTiming {
    const result = this.results.get(queryHash)

    // Storage can hydrate before the view's first render. Preserve that provenance once.
    return result?.source === 'tanstack_persisted' && !this.observed.has(queryHash)
      ? { ...result, available: started, id: crypto.randomUUID() }
      : { available: started, id: crypto.randomUUID(), source: 'tanstack_memory' }
  }

  markObserved(queryHash: string) {
    this.observed.add(queryHash)
  }

  get(queryHash: string) {
    return this.results.get(queryHash)
  }

  observe(
    cache: QueryCache,
    hasConvexResult: (key: QueryKey) => boolean,
    observeConnection?: () => void,
  ) {
    return cache.subscribe((event) => {
      const queryKey = z.array(z.unknown()).parse(event.query.queryKey)

      if (queryKey[0] !== 'convexQuery' || !TIMED_QUERIES.has(String(queryKey[1]))) {
        return
      }

      observeConnection?.()
      this.track(event, queryKey, hasConvexResult)
    })
  }

  private track(
    event: QueryCacheNotifyEvent,
    queryKey: QueryKey,
    hasConvexResult: (key: QueryKey) => boolean,
  ) {
    const { queryHash, state } = event.query
    const action = event.type === 'updated' ? event.action : undefined

    if (event.type === 'removed') {
      this.forget(queryHash)

      return
    }

    if (action?.type === 'fetch') {
      this.fetches.set(queryHash, {
        source: hasConvexResult(queryKey) ? 'convex_client' : 'server',
        started: this.connection.mark(),
      })
    }

    if (action?.type === 'error') {
      this.fetches.delete(queryHash)

      return
    }

    const success = action?.type === 'success'

    if (!success && this.fetches.has(queryHash)) {
      return
    }

    if (state.data === undefined || (!success && this.results.has(queryHash))) {
      return
    }

    const fetch = this.fetches.get(queryHash)
    const manual = action?.type === 'success' && action.manual === true

    if (fetch && manual) {
      return
    }

    const previous = this.results.get(queryHash)

    if (manual && previous) {
      // A live update supersedes persisted content, but must not rewrite the fetch span.
      this.observed.add(queryHash)
      this.emit('query updated', {
        ...resultProperties(state.data),
        consumer_active: event.query.getObserversCount() > 0,
        query_name: queryName(queryKey),
        query_run_id: previous.id,
        received_at_ms: this.connection.mark().at,
      })

      return
    }

    this.complete(event, queryKey, fetch)
  }

  private forget(queryHash: string) {
    this.observed.delete(queryHash)
    this.results.delete(queryHash)
    this.fetches.delete(queryHash)
    this.restored.delete(queryHash)
  }

  private complete(
    event: QueryCacheNotifyEvent,
    queryKey: QueryKey,
    fetch: PendingFetch | undefined,
  ) {
    const { queryHash, state } = event.query
    const available = this.connection.mark()

    const result: ReadinessQueryTiming = {
      available,
      id: crypto.randomUUID(),
      source:
        fetch?.source ?? (this.restored.has(queryHash) ? 'tanstack_persisted' : 'tanstack_memory'),
      ...R.pickBy({ fetchStarted: fetch?.started }, R.isDefined),
    }

    this.results.set(queryHash, result)
    this.fetches.delete(queryHash)

    if (fetch) {
      this.emit('query completed', {
        ...queryProperties(queryKey, result),
        ...resultProperties(state.data),
        consumer_active: event.query.getObserversCount() > 0,
      })
    }
  }
}

export function queryName(key: QueryKey) {
  return {
    'catalog/endpoints/query:grid': 'grid endpoints',
    'catalog/models/query:get': 'model overview',
    'catalog/providers/query:get': 'provider overview',
    'catalog/stats/query:grid': 'grid stats',
  }[String(key[1])]
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- The query cache holds every query's data as unknown; this decodes the timed results.
export function resultProperties(data: unknown) {
  if (Array.isArray(data)) {
    return { result_count: data.length }
  }

  const object = z
    .object({
      as_of: z.string().nullable().optional(),
      // Only the array length is needed; parsing elements would copy the full result.
      rows: z.custom<unknown[]>(Array.isArray).optional(),
      scan_at: z.string().optional(),
    })
    .safeParse(data)

  return object.success
    ? {
        data_scan_at: object.data.as_of ?? object.data.scan_at,
        result_count: object.data.rows?.length ?? 1,
      }
    : { result_count: 0 }
}

export function queryProperties(key: QueryKey, result: ReadinessQueryTiming) {
  const start = result.fetchStarted ?? result.available
  const end = result.available

  return {
    client_cache_hit: result.source !== 'server',
    completed_at_ms: end.at,
    connected_ms: end.connected - start.connected,
    connection_state_at_start: start.phase,
    connection_wait_ms: end.setup - start.setup + end.reconnect - start.reconnect,
    duration_ms: end.at - start.at,
    query_name: queryName(key),
    query_run_id: result.id,
    source: result.source,
    started_at_ms: start.at,
  }
}

export const readinessQueryTimings = new ReadinessQueryTimings(undefined, captureTiming)

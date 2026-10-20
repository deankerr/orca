import type { QueryCache, QueryKey } from '@tanstack/react-query'
import { z } from 'zod'

import { captureTiming } from './capture'
import { ConnectionTimings } from './connection-timing'
import type { TimingMark } from './connection-timing'

export type ReadinessQuerySource =
  | 'tanstack_memory'
  | 'tanstack_persisted'
  | 'convex_client'
  | 'server'

export type ReadinessQueryTiming = {
  id: string
  source: ReadinessQuerySource
  available: TimingMark
  fetchStarted?: TimingMark
}

/** Observe actual cache writes; elapsed time alone cannot identify a cache hit. */
export class ReadinessQueryTimings {
  private restored = new Set<string>()
  private readonly observed = new Set<string>()
  private readonly results = new Map<string, ReadinessQueryTiming>()
  private readonly fetches = new Map<
    string,
    { started: TimingMark; source: ReadinessQuerySource }
  >()

  private readonly emit: (event: string, properties: Record<string, unknown>) => void

  readonly connection: ConnectionTimings

  constructor(
    now = () => performance.now(),
    emit: (event: string, properties: Record<string, unknown>) => void = () => undefined,
  ) {
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
      ? { ...result, id: crypto.randomUUID(), available: started }
      : { id: crypto.randomUUID(), source: 'tanstack_memory', available: started }
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
      const { queryHash, state } = event.query
      const queryKey = z.array(z.unknown()).parse(event.query.queryKey)

      if (
        queryKey[0] !== 'convexQuery' ||
        ![
          'catalog/endpoints/query:grid',
          'catalog/stats/query:grid',
          'catalog/models/query:get',
          'catalog/providers/query:get',
        ].includes(String(queryKey[1]))
      ) {
        return
      }

      observeConnection?.()

      if (event.type === 'removed') {
        this.observed.delete(queryHash)
        this.results.delete(queryHash)
        this.fetches.delete(queryHash)
        this.restored.delete(queryHash)
        return
      }

      if (event.type === 'updated' && event.action.type === 'fetch') {
        this.fetches.set(queryHash, {
          started: this.connection.mark(),
          source: hasConvexResult(queryKey) ? 'convex_client' : 'server',
        })
      }

      if (event.type === 'updated' && event.action.type === 'error') {
        this.fetches.delete(queryHash)
        return
      }

      const success = event.type === 'updated' && event.action.type === 'success'
      if (!success && this.fetches.has(queryHash)) {
        return
      }
      if (state.data === undefined || (!success && this.results.has(queryHash))) {
        return
      }

      const fetch = this.fetches.get(queryHash)
      if (
        fetch &&
        event.type === 'updated' &&
        event.action.type === 'success' &&
        event.action.manual === true
      ) {
        return
      }
      const previous = this.results.get(queryHash)
      if (
        event.type === 'updated' &&
        event.action.type === 'success' &&
        event.action.manual === true &&
        previous &&
        !fetch
      ) {
        // A live update supersedes persisted content, but must not rewrite the fetch span.
        this.observed.add(queryHash)
        this.emit('query updated', {
          ...resultProperties(state.data),
          query_name: queryName(queryKey),
          query_run_id: previous.id,
          consumer_active: event.query.getObserversCount() > 0,
          received_at_ms: this.connection.mark().at,
        })
        return
      }
      const available = this.connection.mark()
      const result: ReadinessQueryTiming = {
        id: crypto.randomUUID(),
        source:
          fetch?.source ??
          (this.restored.has(queryHash) ? 'tanstack_persisted' : 'tanstack_memory'),
        available,
        ...(fetch ? { fetchStarted: fetch.started } : {}),
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
    })
  }
}

export function queryName(key: QueryKey) {
  return {
    'catalog/endpoints/query:grid': 'grid endpoints',
    'catalog/stats/query:grid': 'grid stats',
    'catalog/models/query:get': 'model overview',
    'catalog/providers/query:get': 'provider overview',
  }[String(key[1])]
}

export function resultProperties(data: unknown) {
  if (Array.isArray(data)) {
    return { result_count: data.length }
  }

  const object = z
    .object({
      // Only the array length is needed; parsing elements would copy the full result.
      rows: z.custom<unknown[]>(Array.isArray).optional(),
      as_of: z.string().nullable().optional(),
      scan_at: z.string().optional(),
    })
    .safeParse(data)

  return object.success
    ? {
        result_count: object.data.rows?.length ?? 1,
        data_scan_at: object.data.as_of ?? object.data.scan_at,
      }
    : { result_count: 0 }
}

export function queryProperties(key: QueryKey, result: ReadinessQueryTiming) {
  const start = result.fetchStarted ?? result.available
  const end = result.available
  return {
    query_name: queryName(key),
    query_run_id: result.id,
    source: result.source,
    client_cache_hit: result.source !== 'server',
    duration_ms: end.at - start.at,
    connection_wait_ms: end.setup - start.setup + end.reconnect - start.reconnect,
    connected_ms: end.connected - start.connected,
    connection_state_at_start: start.phase,
    started_at_ms: start.at,
    completed_at_ms: end.at,
  }
}

export const readinessQueryTimings = new ReadinessQueryTimings(undefined, captureTiming)

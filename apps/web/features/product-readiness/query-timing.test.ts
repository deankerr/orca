import { dehydrate, hashKey, hydrate, QueryClient } from '@tanstack/react-query'
import { expect, test } from 'vitest'

import { ReadinessQueryTimings, resultProperties } from './query-timing'

const key = ['convexQuery', 'catalog/endpoints/query:grid', {}] as const

test('result metadata counts rows without reading their contents', () => {
  const rows: unknown[] = []
  rows.length = 100_000

  Object.defineProperty(rows, '0', {
    get() {
      throw new Error('Telemetry must not visit row contents')
    },
  })

  expect(resultProperties(rows)).toEqual({ result_count: 100_000 })
  expect(resultProperties({ as_of: '2026-10-11T00:00:00Z', rows })).toEqual({
    data_scan_at: '2026-10-11T00:00:00Z',
    result_count: 100_000,
  })
  expect(resultProperties({ scan_at: '2026-10-11T00:00:00Z' })).toEqual({
    data_scan_at: '2026-10-11T00:00:00Z',
    result_count: 1,
  })
  expect(resultProperties(null)).toEqual({ result_count: 0 })
})

function setup(localResult = false) {
  let now = 100
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  })
  const timings = new ReadinessQueryTimings(() => now)
  timings.connection.update({ hasEverConnected: true, isWebSocketConnected: true })
  timings.observe(client.getQueryCache(), () => localResult)

  return {
    advance: () => {
      now += 25
    },
    client,
    timings,
  }
}

test('subscription updates do not rewrite the completed fetch span', async () => {
  const { client, timings, advance } = setup()
  await client.query({
    queryFn: () => {
      advance()
      return ['first']
    },
    queryKey: key,
  })
  const result = timings.get(hashKey(key))
  expect(result?.source).toBe('server')
  expect(result?.available.at).toBe(125)
  expect(result?.fetchStarted?.at).toBe(100)
  advance()
  client.setQueryData(key, ['updated'])
  expect(timings.get(hashKey(key))?.available.at).toBe(125)
})

test('a Convex local result is distinguished from a server wait', async () => {
  const { client, timings } = setup(true)
  await client.query({ queryFn: () => ['cached'], queryKey: key })
  expect(timings.get(hashKey(key))?.source).toBe('convex_client')
})

test('persisted hydration of an existing pending query does not count as a fetch', () => {
  const source = new QueryClient()
  source.setQueryData(key, ['stored'])
  const restored = dehydrate(source)
  const { client, timings } = setup()
  client.getQueryCache().build(client, { queryKey: key })
  timings.markRestored(restored.queries.map((query) => query.queryHash))
  hydrate(client, restored)
  expect(timings.get(hashKey(key))?.source).toBe('tanstack_persisted')
  expect(timings.get(hashKey(key))?.fetchStarted).toBeUndefined()
})

test('hydration of a new query is also identified as persisted', () => {
  const source = new QueryClient()
  source.setQueryData(key, [])
  const restored = dehydrate(source)
  const { client, timings } = setup()
  timings.markRestored(restored.queries.map((query) => query.queryHash))
  hydrate(client, restored)
  expect(timings.get(hashKey(key))?.source).toBe('tanstack_persisted')
})

test('distinct query arguments have independent results', async () => {
  const { client, timings } = setup()
  client.setQueryData(key, ['warm'])
  const coldKey = [key[0], key[1], { filter: 'new' }]
  await client.query({ queryFn: () => ['cold'], queryKey: coldKey })
  expect(timings.get(hashKey(key))?.source).toBe('tanstack_memory')
  expect(timings.get(hashKey(coldKey))?.source).toBe('server')
})

test('failed queries are not reported as completed', async () => {
  const { client, timings } = setup()
  const result = await client
    .query({
      queryFn: () => {
        throw new Error('offline')
      },
      queryKey: key,
    })
    .catch((error: unknown) => error)
  expect(result).toBeInstanceOf(Error)
  expect(timings.get(hashKey(key))).toBeUndefined()
})

test('storage restored before mount keeps provenance once, then becomes a memory hit', () => {
  const source = new QueryClient()
  source.setQueryData(key, ['stored'])
  const restored = dehydrate(source)
  const { client, timings } = setup()
  timings.markRestored(restored.queries.map((query) => query.queryHash))
  hydrate(client, restored)
  expect(timings.initial(hashKey(key), timings.connection.mark()).source).toBe('tanstack_persisted')
  timings.markObserved(hashKey(key))
  expect(timings.initial(hashKey(key), timings.connection.mark())).toMatchObject({
    available: timings.connection.mark(),
    source: 'tanstack_memory',
  })
})

test('overview queries are observed without a preceding grid query', async () => {
  const { client, timings, advance } = setup()

  for (const [name, args] of [
    ['catalog/models/query:get', { model_id: 'example/model' }],
    ['catalog/providers/query:get', { provider_id: 'example' }],
  ] as const) {
    const queryKey = ['convexQuery', name, args]
    await client.query({
      queryFn: () => {
        advance()
        return { display_name: 'Example' }
      },
      queryKey,
    })
    expect(timings.get(hashKey(queryKey))?.source).toBe('server')
    expect(timings.get(hashKey(queryKey))?.fetchStarted).toBeDefined()
  }
})

test('each actual refetch gets a new run and ignores old cached data during fetch', async () => {
  let now = 0
  const events: { event: string; properties: Record<string, unknown> }[] = []
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const timings = new ReadinessQueryTimings(
    () => now,
    (event, properties) => {
      events.push({ event, properties })
    },
  )
  timings.observe(client.getQueryCache(), () => false)
  await client.query({
    queryFn: () => {
      now += 10
      return ['first']
    },
    queryKey: key,
  })
  const first = timings.get(hashKey(key))
  await client.query({
    queryFn: () => {
      now += 30
      return ['second']
    },
    queryKey: key,
  })
  const second = timings.get(hashKey(key))
  expect(second?.id).not.toBe(first?.id)
  expect(events.map(({ properties }) => properties.duration_ms)).toEqual([10, 30])
  now += 100
  client.setQueryData(key, ['push'])
  expect(events.at(-1)?.event).toBe('query updated')
  expect(events.at(-1)?.properties.duration_ms).toBeUndefined()
})

test('inactive completions are excludable and errors emit no completed event', async () => {
  const events: Record<string, unknown>[] = []
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const timings = new ReadinessQueryTimings(
    () => 0,
    (event, properties) => {
      if (event === 'query completed') {
        events.push(properties)
      }
    },
  )
  timings.observe(client.getQueryCache(), () => false)
  await client
    .query({
      queryFn: () => {
        throw new Error('failed')
      },
      queryKey: key,
    })
    .catch(() => undefined)
  expect(events).toHaveLength(0)
  await client.query({ queryFn: () => ['success'], queryKey: key })
  expect(events).toHaveLength(1)
  expect(events[0]?.consumer_active).toBe(false)
})

test('connection overlap is per query; connection lifecycle is emitted separately', async () => {
  let now = 0
  const events: { event: string; properties: Record<string, unknown> }[] = []
  const client = new QueryClient()
  const timings = new ReadinessQueryTimings(
    () => now,
    (event, properties) => {
      events.push({ event, properties })
    },
  )
  timings.connection.update({ hasEverConnected: false, isWebSocketConnected: false })
  timings.observe(client.getQueryCache(), () => false)
  await client.query({
    queryFn: () => {
      now = 20
      timings.connection.update({ hasEverConnected: true, isWebSocketConnected: true })
      now = 70
      return ['loaded']
    },
    queryKey: key,
  })
  expect(events.find(({ event }) => event === 'convex connected')?.properties.duration_ms).toBe(20)
  expect(events.find(({ event }) => event === 'query completed')?.properties).toMatchObject({
    connected_ms: 50,
    connection_wait_ms: 20,
    duration_ms: 70,
  })
})

import { expect, test } from 'bun:test'

import { dehydrate, hashKey, hydrate, QueryClient } from '@tanstack/react-query'

import { ReadinessQueryTimings } from './query-timing'

const key = ['convexQuery', 'catalog/endpoints/query:grid', {}] as const

function setup(localResult = false) {
  let now = 100
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
  const timings = new ReadinessQueryTimings(() => now)
  timings.connection.update({ isWebSocketConnected: true, hasEverConnected: true })
  timings.observe(client.getQueryCache(), () => localResult)

  return {
    client,
    timings,
    advance: () => {
      now += 25
    },
  }
}

test('subscription updates do not rewrite the completed fetch span', async () => {
  const { client, timings, advance } = setup()
  await client.query({
    queryKey: key,
    queryFn: () => {
      advance()
      return ['first']
    },
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
  await client.query({ queryKey: key, queryFn: () => ['cached'] })
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
  await client.query({ queryKey: coldKey, queryFn: () => ['cold'] })
  expect(timings.get(hashKey(key))?.source).toBe('tanstack_memory')
  expect(timings.get(hashKey(coldKey))?.source).toBe('server')
})

test('failed queries are not reported as completed', async () => {
  const { client, timings } = setup()
  const result = await client
    .query({
      queryKey: key,
      queryFn: () => {
        throw new Error('offline')
      },
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
    source: 'tanstack_memory',
    available: timings.connection.mark(),
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
      queryKey,
      queryFn: () => {
        advance()
        return { display_name: 'Example' }
      },
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
    queryKey: key,
    queryFn: () => {
      now += 10
      return ['first']
    },
  })
  const first = timings.get(hashKey(key))
  await client.query({
    queryKey: key,
    queryFn: () => {
      now += 30
      return ['second']
    },
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
      queryKey: key,
      queryFn: () => {
        throw new Error('failed')
      },
    })
    .catch(() => undefined)
  expect(events).toHaveLength(0)
  await client.query({ queryKey: key, queryFn: () => ['success'] })
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
  timings.connection.update({ isWebSocketConnected: false, hasEverConnected: false })
  timings.observe(client.getQueryCache(), () => false)
  await client.query({
    queryKey: key,
    queryFn: () => {
      now = 20
      timings.connection.update({ isWebSocketConnected: true, hasEverConnected: true })
      now = 70
      return ['loaded']
    },
  })
  expect(events.find(({ event }) => event === 'convex connected')?.properties.duration_ms).toBe(20)
  expect(events.find(({ event }) => event === 'query completed')?.properties).toMatchObject({
    duration_ms: 70,
    connection_wait_ms: 20,
    connected_ms: 50,
  })
})

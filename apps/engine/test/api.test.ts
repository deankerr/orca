import { describe, expect, test } from 'bun:test'
// oxlint-disable typescript/no-unsafe-assignment -- `expect.any(…)` is typed `any`
// oxlint-disable typescript/no-unsafe-type-assertion -- a fake bucket and a decoded JSON body are
// both deliberately narrower than what the type system can know here

// * The API, driven end to end against a fake bucket.
// *
// * Nothing here mocks the archive: `Artifacts.make` takes a bucket client, so the real store, the
// * real key grammar and the real schemas all run — the only stand-in is R2 itself, ~40 lines of Map.
// * That is the seam the archive was shaped around, and this is what it buys.
import { batchIdAt, EndpointsQuery } from '@orca/schema/artifacts.ts'
import type * as Cloudflare from 'alchemy/Cloudflare'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import * as Stream from 'effect/Stream'
import * as HttpServerRequest from 'effect/unstable/http/HttpServerRequest'
import * as HttpServerResponse from 'effect/unstable/http/HttpServerResponse'

import * as Api from '../src/api.ts'
import * as Artifacts from '../src/artifacts.ts'

type Stored = { key: string; body: string; customMetadata: Record<string, string> }

// * R2's surface, as much of it as the archive uses. The cursor is an offset because the archive
// * treats it as opaque — if it ever stops doing that, this fake stops working, which is the point.
const fakeBucket = (store: Map<string, Stored>) => {
  const object = (it: Stored) => ({
    customMetadata: it.customMetadata,
    key: it.key,
    size: it.body.length,
    writeHttpMetadata: () => Effect.void,
  })

  const bucket = {
    get: (key: string) =>
      Effect.sync(() => {
        const it = store.get(key)
        return it === undefined
          ? null
          : { ...object(it), body: Stream.make(new TextEncoder().encode(it.body)) }
      }),

    head: (key: string) =>
      Effect.sync(() => {
        const it = store.get(key)
        return it === undefined ? null : object(it)
      }),

    list: (options: { prefix?: string; limit?: number; cursor?: string }) =>
      Effect.sync(() => {
        const matching = [...store.values()]
          .filter((it) => it.key.startsWith(options.prefix ?? ''))
          .toSorted((left, right) => (left.key < right.key ? -1 : 1))

        const from = options.cursor === undefined ? 0 : Number(options.cursor)
        const to = from + (options.limit ?? 20)
        const objects = matching.slice(from, to).map(object)

        return to < matching.length
          ? { cursor: String(to), delimitedPrefixes: [], objects, truncated: true }
          : { delimitedPrefixes: [], objects, truncated: false }
      }),

    put: (key: string, body: string, options: { customMetadata: Record<string, string> }) =>
      Effect.sync(() => {
        const it = { body, customMetadata: options.customMetadata, key }
        store.set(key, it)
        return object(it)
      }),
  }

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a fake implements the four
  // methods the archive calls, not R2's multipart surface
  return bucket as unknown as Cloudflare.R2.ReadWriteBucketClient
}

const decodeQuery = Schema.decodeUnknownSync(EndpointsQuery)

// * One seeded crawl: a catalog, two responses that landed and one that 404ed.
const seeded = Effect.gen(function* seeded() {
  const artifacts = Artifacts.make(fakeBucket(new Map<string, Stored>()))
  const batch = batchIdAt(yield* DateTime.now)

  yield* artifacts.putCatalog({ batch, body: JSON.stringify({ data: [] }) })

  for (const [permaslug, variant, status] of [
    ['anthropic/claude-opus-5-20260723', 'standard', 200],
    ['anthropic/claude-haiku-4.5', 'free', 200],
    ['openai/gpt-5.2', 'standard', 404],
  ] as const) {
    yield* artifacts.putEndpoints({
      body: JSON.stringify({ data: [{ permaslug }] }),
      query: decodeQuery({ batch, permaslug, variant }),
      status,
    })
  }

  const app = Api.handler({ artifacts, crawl: Effect.die('no crawl in tests') })

  // * One request in, one web `Response` out — the same effect the Worker hands to Alchemy.
  const call = async (path: string) =>
    await Effect.runPromise(
      app.pipe(
        Effect.provideService(
          HttpServerRequest.HttpServerRequest,
          HttpServerRequest.fromWeb(new Request(`http://engine${path}`)),
        ),
        Effect.scoped,
        Effect.map(HttpServerResponse.toWeb),
      ),
    )

  return { batch, call }
})

const archive = async () => await Effect.runPromise(seeded)

// * Bodies are read as `unknown` and matched structurally, so no test has to assert a shape the API
// * already declares.
const body = async (response: Response): Promise<unknown> => await response.json()

const statusOf = async (pending: Promise<Response>) => {
  const response = await pending
  return response.status
}

describe('navigating the archive', () => {
  test('lists crawls, then one crawl in detail', async () => {
    const { batch, call } = await archive()

    expect(await body(await call('/batches'))).toEqual({
      cursor: null,
      items: [{ batch, bytes: 11, observed_at: expect.any(String) }],
    })

    expect(await body(await call(`/batches/${batch}`))).toMatchObject({
      batch,
      // * two 200s and a 404: the 404 is an observation, not a failure of the crawl
      endpoints: { bytes: 153, objects: 3, statuses: { '200': 2, '404': 1 } },
    })
  })

  test('latest answers with the most recent crawl', async () => {
    const { batch, call } = await archive()
    expect(await body(await call('/batches/latest'))).toMatchObject({ batch })
  })

  test('an author narrows the listing', async () => {
    const { batch, call } = await archive()

    expect(await body(await call(`/batches/${batch}/endpoints`))).toMatchObject({
      items: [{ variant: 'free' }, { variant: 'standard' }, { permaslug: 'openai/gpt-5.2' }],
    })

    expect(await body(await call(`/batches/${batch}/endpoints?author=anthropic`))).toEqual({
      cursor: null,
      items: [
        {
          bytes: 53,
          name: 'anthropic.claude-haiku-4.5.free',
          observed_at: expect.any(String),
          permaslug: 'anthropic/claude-haiku-4.5',
          status: 200,
          variant: 'free',
        },
        {
          bytes: 59,
          name: 'anthropic.claude-opus-5-20260723.standard',
          observed_at: expect.any(String),
          permaslug: 'anthropic/claude-opus-5-20260723',
          status: 200,
          variant: 'standard',
        },
      ],
    })
  })

  test('a page carries the cursor for the next one', async () => {
    const { batch, call } = await archive()

    const first = await body(await call(`/batches/${batch}/endpoints?limit=1`))

    // * ⚠️ Read the cursor out before asserting on it: `toMatchObject` leaves `expect.any(…)` behind
    // * in the received object, so a value read afterwards is the matcher, not the cursor.
    const { cursor } = first as { cursor: string }

    expect(first).toMatchObject({
      cursor: expect.any(String),
      items: [{ name: 'anthropic.claude-haiku-4.5.free' }],
    })
    const next = await call(`/batches/${batch}/endpoints?limit=1&cursor=${cursor}`)
    expect(await body(next)).toMatchObject({
      items: [{ name: 'anthropic.claude-opus-5-20260723.standard' }],
    })
  })

  test('stored documents come back as they were stored', async () => {
    const { batch, call } = await archive()

    const catalog = await call(`/batches/${batch}/catalog`)
    expect(catalog.headers.get('content-type')).toBe('application/json')
    expect(await catalog.text()).toBe('{"data":[]}')

    const response = await call(`/batches/${batch}/endpoints/anthropic.claude-haiku-4.5.free`)
    expect(await response.text()).toBe('{"data":[{"permaslug":"anthropic/claude-haiku-4.5"}]}')
  })
})

describe('refusing what it cannot answer', () => {
  test('a batch id that is not a timestamp is a bad request, not a lookup', async () => {
    const { call } = await archive()

    expect(await statusOf(call('/batches/not-a-batch-id'))).toBe(400)
    expect(await statusOf(call('/batches/2026-07-27T04-33-43Z%2F..'))).toBe(400)
    // * a traversal attempt never even reaches the param: the URL normalises to `/etc`, and there is
    // * no route there. The `BatchId` pattern is the second line of defence, not the first.
    expect(await statusOf(call('/batches/../../etc'))).toBe(404)
  })

  test('a limit outside the page range is a bad request', async () => {
    const { batch, call } = await archive()

    expect(await statusOf(call(`/batches/${batch}/endpoints?limit=0`))).toBe(400)
    expect(await statusOf(call(`/batches/${batch}/endpoints?limit=1001`))).toBe(400)
    expect(await statusOf(call(`/batches/${batch}/endpoints?limit=half`))).toBe(400)
  })

  test('a well-formed name for something absent is a 404', async () => {
    const { batch, call } = await archive()

    expect(await statusOf(call('/batches/2020-01-01T00-00-00Z'))).toBe(404)
    expect(await statusOf(call(`/batches/${batch}/endpoints/nope.standard`))).toBe(404)
  })

  test('an unknown path is a 404, and the root is a signpost', async () => {
    const { call } = await archive()

    expect(await statusOf(call('/nope'))).toBe(404)
    expect(await statusOf(call('/'))).toBe(302)
  })
})

describe('describing itself', () => {
  test('serves an OpenAPI document naming every endpoint', async () => {
    const { call } = await archive()
    const document = await body(await call('/openapi.json'))

    const { info, paths } = document as { info: { title: string }; paths: Record<string, unknown> }

    expect(info.title).toBe('ORCA engine')
    expect(Object.keys(paths).toSorted()).toEqual([
      '/batches',
      '/batches/latest',
      '/batches/{batch}',
      '/batches/{batch}/catalog',
      '/batches/{batch}/endpoints',
      '/batches/{batch}/endpoints/{name}',
      '/crawl',
    ])
  })
})

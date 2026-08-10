// * Sole OpenRouter client. Transient statuses retry; settled statuses (including errors) return.
import type { CatalogModel } from '@orca/schema/openrouter.ts'
import { CatalogResponse, Envelope } from '@orca/schema/openrouter.ts'
import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'
import * as Schedule from 'effect/Schedule'
import * as Schema from 'effect/Schema'

const BASE_URL = 'https://openrouter.ai'
const CATALOG_PATH = '/api/frontend/v1/catalog/models'
const ENDPOINTS_PATH = '/api/frontend/v1/stats/endpoint'

const decodeCatalog = Schema.decodeUnknownEffect(CatalogResponse)
const decodeEnvelope = Schema.decodeUnknownEffect(Envelope)

// * Record preserves every key so we can spread without stripping unknown fields.
const decodeObject = Schema.decodeUnknownEffect(Schema.Record(Schema.String, Schema.Unknown))

const parseJson = (body: string) =>
  Effect.try((): unknown => JSON.parse(body)).pipe(Effect.flatMap(decodeObject))

const isTransient = (status: number) => status === 429 || status >= 500

/** Internal retry signal; never escapes this module. */
class Transient extends Data.TaggedError('Transient')<{ settled: SettledHttp }> {}

/** ~7s of exponential backoff — rate limits, short enough for four concurrent Workers. */
const backoff = Schedule.exponential('1 second')

// * Bot-management cookie changes every response; keeping it makes header diffs always dirty.
const DROPPED_HEADERS = new Set(['set-cookie'])

/** One finished HTTP exchange (after transient retries). */
type SettledHttp = {
  status: number
  /** Includes date / age / cf-cache-status when present; see DROPPED_HEADERS. */
  headers: Record<string, string>
  body: string
}

/** Status + document body stored in the archive for one endpoints observation. */
export type Observation = {
  readonly status: number
  readonly body: string
}

/** Catalog fetch: work list plus the batch-root document to store. */
export type CatalogCapture = {
  readonly body: string
  readonly models: ReadonlyArray<CatalogModel>
}

const get = Effect.fn(function* get(path: string, params?: Record<string, string>) {
  const url = new URL(path, BASE_URL)
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value)
  }

  const once = Effect.gen(function* once() {
    const settled = yield* Effect.tryPromise(async (): Promise<SettledHttp> => {
      const sent = await fetch(url, { headers: { accept: 'application/json' } })
      return {
        body: await sent.text(),
        headers: Object.fromEntries(
          [...sent.headers].filter(([name]) => !DROPPED_HEADERS.has(name)),
        ),
        status: sent.status,
      }
    })

    return isTransient(settled.status) ? yield* new Transient({ settled }) : settled
  })

  // * Retry only Transient; transport failures pass through. Exhausted retries → last settled body.
  return yield* once.pipe(
    Effect.retry({ schedule: backoff, times: 3, while: (error) => error instanceof Transient }),
    Effect.catchTag('Transient', (error) => Effect.succeed(error.settled)),
  )
})

/** Gate with Envelope (or a stronger schema), keep original keys, attach response headers. */
const documentBody = <E>(
  settled: SettledHttp,
  gate: (parsed: Record<string, unknown>) => Effect.Effect<unknown, E>,
) =>
  Effect.gen(function* documentBody() {
    const parsed = yield* parseJson(settled.body)
    yield* gate(parsed)
    return JSON.stringify({ ...parsed, headers: settled.headers })
  })

/**
 * Crawl starting point. Non-200 after retries is a defect (observation of us, not of OpenRouter) —
 * nothing is stored.
 */
export const catalog = Effect.fn(function* catalog() {
  const settled = yield* get(CATALOG_PATH)
  if (settled.status !== 200) {
    return yield* Effect.die(new Error(`catalog returned ${settled.status}: ${settled.body}`))
  }

  // * Stronger gate than Envelope; parse once for models + store body.
  const parsed = yield* parseJson(settled.body).pipe(Effect.orDie)
  const { data } = yield* decodeCatalog(parsed)

  return {
    body: JSON.stringify({ ...parsed, headers: settled.headers }),
    models: data,
  } satisfies CatalogCapture
})

/**
 * One endpoints observation at whatever status it settled on (404 included). Body parse failure
 * after a settled response is a defect (upstream contract break).
 */
export const endpoints = Effect.fn(function* endpoints(args: {
  permaslug: string
  variant: string
}) {
  const settled = yield* get(ENDPOINTS_PATH, {
    permaslug: args.permaslug,
    variant: args.variant,
  })

  const body = yield* documentBody(settled, (parsed) => decodeEnvelope(parsed)).pipe(Effect.orDie)
  return { body, status: settled.status } satisfies Observation
})

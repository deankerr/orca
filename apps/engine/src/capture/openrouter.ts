// * OpenRouter client for capture.
// *
// * Settle HTTP (retry transients → final status + body). On 200, decode the
// * success envelope `{ data }` with passthrough schemas so required identity
// * fields are checked and all other fields are kept. Non-200 responses are
// * associated with an error status and are not parsed as data.
// *
// * Does not decide capture policy (abort sample, archive, mark observed).
// * Callers in plan/process own that; they only ever receive valid data shapes
// * to persist.
import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'
import * as Schedule from 'effect/Schedule'
import * as Schema from 'effect/Schema'

const BASE_URL = 'https://openrouter.ai'
const CATALOG_PATH = '/api/frontend/v1/catalog/models'
const ENDPOINTS_PATH = '/api/frontend/v1/stats/endpoint'

/** Keep undeclared keys — Struct otherwise strips them. */
const preserve = { onExcessProperty: 'preserve' as const }

// * ── Success shapes (route-specific rows, full payload via passthrough) ──────

/**
 * Model rows from catalog `data`.
 * OpenRouter encodes model identity oddly (slug / permaslug / serving endpoint).
 */
const CatalogModel = Schema.Struct({
  endpoint: Schema.NullOr(Schema.Struct({ variant: Schema.String })),
  permaslug: Schema.String,
  slug: Schema.String,
})
const CatalogBody = Schema.Struct({
  data: Schema.Array(CatalogModel),
})
const decodeCatalogBody = Schema.decodeUnknownEffect(Schema.fromJsonString(CatalogBody), preserve)

/** Endpoint rows from endpoints `data`. */
const EndpointRow = Schema.Struct({
  id: Schema.String,
})

const EndpointsBody = Schema.Struct({
  data: Schema.Array(EndpointRow),
})
const decodeEndpointsBody = Schema.decodeUnknownEffect(
  Schema.fromJsonString(EndpointsBody),
  preserve,
)

// * ── Transport ──────────────────────────────────────────────────────────────

const isTransient = (status: number) => status === 429 || status >= 500

class Transient extends Data.TaggedError('Transient')<{
  status: number
  body: string
}> {}

const backoff = Schedule.exponential('1 second')

type Settled = {
  readonly status: number
  readonly body: string
}

/** GET a fully formed URL. Retries 429/5xx briefly, then settles. */
const get = Effect.fn(function* get(url: URL) {
  const once = Effect.gen(function* once() {
    const settled = yield* Effect.tryPromise(async (): Promise<Settled> => {
      const response = await fetch(url, { headers: { accept: 'application/json' } })
      return { body: await response.text(), status: response.status }
    })
    return isTransient(settled.status)
      ? yield* new Transient({ body: settled.body, status: settled.status })
      : settled
  })

  return yield* once.pipe(
    Effect.retry({ schedule: backoff, times: 3, while: (error) => error instanceof Transient }),
    Effect.catchTag('Transient', (error) =>
      Effect.succeed({ body: error.body, status: error.status } satisfies Settled),
    ),
  )
})

// * ── Routes ─────────────────────────────────────────────────────────────────

/**
 * Catalog models inventory.
 * Non-200 → status + raw body (no data parse). 200 → validated `data` (or die).
 */
export const fetchCatalog = Effect.fn(function* fetchCatalog() {
  const settled = yield* get(new URL(CATALOG_PATH, BASE_URL))
  if (settled.status !== 200) {
    return {
      _tag: 'HttpError' as const,
      body: settled.body,
      status: settled.status,
    }
  }
  const { data } = yield* decodeCatalogBody(settled.body).pipe(Effect.orDie)
  return { _tag: 'HttpData' as const, data, status: settled.status }
})

/**
 * Endpoints for one model scope.
 * Non-200 → status + raw body (no data parse). 200 → validated `data` (or die).
 */
export const fetchEndpoints = Effect.fn(function* fetchEndpoints(args: {
  permaslug: string
  variant: string
}) {
  const url = new URL(ENDPOINTS_PATH, BASE_URL)
  url.searchParams.set('permaslug', args.permaslug)
  url.searchParams.set('variant', args.variant)

  const settled = yield* get(url)
  if (settled.status !== 200) {
    return {
      _tag: 'HttpError' as const,
      body: settled.body,
      status: settled.status,
    }
  }
  const { data } = yield* decodeEndpointsBody(settled.body).pipe(Effect.orDie)
  return { _tag: 'HttpData' as const, data, status: settled.status }
})

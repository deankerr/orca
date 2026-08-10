// * Minimal OpenRouter client for capture. Settled statuses return; only transients retry.
// * Bodies are stored as received — no header injection, no field stripping.
import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'
import * as Schedule from 'effect/Schedule'
import * as Schema from 'effect/Schema'

const BASE_URL = 'https://openrouter.ai'
const CATALOG_PATH = '/api/frontend/v1/catalog/models'
const ENDPOINTS_PATH = '/api/frontend/v1/stats/endpoint'

// * Only what work planning needs. Full document stays in the stored body.
const CatalogModel = Schema.Struct({
  endpoint: Schema.NullOr(Schema.Struct({ variant: Schema.String })),
  permaslug: Schema.String,
  slug: Schema.String,
})

const CatalogResponse = Schema.Struct({
  data: Schema.Array(CatalogModel),
})

const decodeCatalog = Schema.decodeUnknownEffect(Schema.fromJsonString(CatalogResponse))

// * Gate only: data|error present. Do not re-encode — would strip unknown keys if used for storage.
const Envelope = Schema.Union([
  Schema.Struct({ data: Schema.Unknown }),
  Schema.Struct({ error: Schema.Unknown }),
])
const decodeEnvelope = Schema.decodeUnknownEffect(Schema.fromJsonString(Envelope))

const isTransient = (status: number) => status === 429 || status >= 500

class Transient extends Data.TaggedError('Transient')<{
  status: number
  body: string
}> {}

const backoff = Schedule.exponential('1 second')

type Settled = { status: number; body: string }

const get = Effect.fn(function* get(path: string, params?: Record<string, string>) {
  const url = new URL(path, BASE_URL)
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value)
  }

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

export type CatalogModel = Schema.Schema.Type<typeof CatalogModel>

export type CatalogCapture = {
  readonly body: string
  readonly models: ReadonlyArray<CatalogModel>
}

export type EndpointsCapture = {
  readonly status: number
  readonly body: string
}

/** Catalog: non-200 after retries is a defect (nothing stored). */
export const catalog = Effect.fn(function* catalog() {
  const settled = yield* get(CATALOG_PATH)
  if (settled.status !== 200) {
    return yield* Effect.die(new Error(`catalog returned ${settled.status}: ${settled.body}`))
  }

  const { data } = yield* decodeCatalog(settled.body).pipe(Effect.orDie)
  return { body: settled.body, models: data } satisfies CatalogCapture
})

/**
 * One endpoints observation at whatever status it settled on (404 included).
 * Body is stored as received after a light envelope gate.
 */
export const endpoints = Effect.fn(function* endpoints(args: {
  permaslug: string
  variant: string
}) {
  const settled = yield* get(ENDPOINTS_PATH, {
    permaslug: args.permaslug,
    variant: args.variant,
  })

  yield* decodeEnvelope(settled.body).pipe(Effect.orDie)
  return { body: settled.body, status: settled.status } satisfies EndpointsCapture
})

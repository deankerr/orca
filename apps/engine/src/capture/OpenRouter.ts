// * OpenRouter client for capture.
// *
// * Settle HTTP (retry transients → final status + body). On 200, decode the
// * success envelope `{ data }` with passthrough schemas so required identity
// * fields are checked and all other fields are kept. Non-200 responses are
// * associated with an error status and are not parsed as data.
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Schedule from 'effect/Schedule'
import * as Schema from 'effect/Schema'
import * as HttpClient from 'effect/unstable/http/HttpClient'
import * as HttpClientRequest from 'effect/unstable/http/HttpClientRequest'

const BASE_URL = 'https://openrouter.ai'
const CATALOG_PATH = '/api/frontend/v1/catalog/models'
const ENDPOINTS_PATH = '/api/frontend/v1/stats/endpoint'

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
const decodeCatalogBody = Schema.decodeUnknownEffect(Schema.fromJsonString(CatalogBody), {
  onExcessProperty: 'preserve',
})

/** Endpoint rows from endpoints `data`. */
const EndpointRow = Schema.Struct({
  id: Schema.String,
})

const EndpointsBody = Schema.Struct({
  data: Schema.Array(EndpointRow),
})
const decodeEndpointsBody = Schema.decodeUnknownEffect(Schema.fromJsonString(EndpointsBody), {
  onExcessProperty: 'preserve',
})

// * ── Transport ──────────────────────────────────────────────────────────────

const isTransient = (status: number) => status === 429 || status >= 500

type Transient = {
  readonly _tag: 'Transient'
  readonly status: number
  readonly body: string
}

const backoff = Schedule.exponential('1 second')

type Settled = {
  readonly status: number
  readonly body: string
}

/** GET a path (absolute URL or path under BASE_URL). Retries 429/5xx briefly, then settles. */
const get = Effect.fn(function* get(
  client: HttpClient.HttpClient,
  url: string,
  options?: { readonly urlParams?: Record<string, string> },
) {
  const once = Effect.gen(function* once() {
    const response = yield* client.get(url, { urlParams: options?.urlParams })
    const body = yield* response.text
    const settled = { body, status: response.status } satisfies Settled
    return isTransient(settled.status)
      ? yield* Effect.fail({
          _tag: 'Transient',
          body: settled.body,
          status: settled.status,
        } satisfies Transient)
      : settled
  })

  return yield* once.pipe(
    Effect.retry({ schedule: backoff, times: 3, while: (error) => error._tag === 'Transient' }),
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
const fetchCatalog = (client: HttpClient.HttpClient) =>
  Effect.gen(function* fetchCatalog() {
    const settled = yield* get(client, `${BASE_URL}${CATALOG_PATH}`)
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
const fetchEndpoints = (
  client: HttpClient.HttpClient,
  args: {
    permaslug: string
    variant: string
  },
) =>
  Effect.gen(function* fetchEndpoints() {
    const settled = yield* get(client, `${BASE_URL}${ENDPOINTS_PATH}`, {
      urlParams: { permaslug: args.permaslug, variant: args.variant },
    })
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

const make = Effect.gen(function* makeOpenRouterClient() {
  const client = (yield* HttpClient.HttpClient).pipe(
    HttpClient.mapRequest(HttpClientRequest.acceptJson),
  )
  return {
    fetchCatalog: fetchCatalog(client),
    fetchEndpoints: (args: { permaslug: string; variant: string }) => fetchEndpoints(client, args),
  }
})

/** Replaceable OpenRouter capture boundary. The live implementation uses Effect's HttpClient. */
export class OpenRouterClient extends Context.Service<OpenRouterClient>()(
  'engine/capture/OpenRouterClient',
  { make },
) {
  static readonly layer = Layer.effect(this, this.make)
}

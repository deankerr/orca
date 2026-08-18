import type { Endpoint, Inventory, ModelEndpoints, ModelVariant } from '@orca/inventory'
import * as Context from 'effect/Context'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Schedule from 'effect/Schedule'
import * as Schema from 'effect/Schema'
import * as FetchHttpClient from 'effect/unstable/http/FetchHttpClient'
import * as HttpClient from 'effect/unstable/http/HttpClient'
import * as HttpClientRequest from 'effect/unstable/http/HttpClientRequest'
import * as HttpClientResponse from 'effect/unstable/http/HttpClientResponse'

import { OpenRouterClientError } from './OpenRouterClientError.ts'

const JsonRecord = Schema.Record(Schema.String, Schema.Json)
const Identity = Schema.NonEmptyString

const UpstreamCatalogEntry = Schema.Struct({
  endpoint: Schema.NullOr(Schema.Struct({ variant: Identity })),
  permaslug: Identity,
  slug: Identity,
})
type UpstreamCatalogEntry = typeof UpstreamCatalogEntry.Type

const UpstreamEndpoint = Schema.StructWithRest(
  Schema.Struct({
    id: Identity,
    model: Schema.StructWithRest(
      Schema.Struct({
        name: Identity,
        short_name: Identity,
      }),
      [JsonRecord],
    ),
    model_variant_permaslug: Identity,
    model_variant_slug: Identity,
    variant: Identity,
  }),
  [JsonRecord],
)
type UpstreamEndpoint = typeof UpstreamEndpoint.Type

// Built once because this decoder is used for every model's endpoint request in a read.
const UpstreamEndpointsResponse = Schema.Struct({ data: Schema.Array(UpstreamEndpoint) })

/**
 * OpenRouter's frontend catalog is the discovery index; its endpoint stats route contains the
 * richer endpoint rows and embedded model used to build each `ModelEndpoints`. Keeping both
 * requests here prevents consumers from depending on either upstream response shape.
 */
const BASE_URL = 'https://openrouter.ai'
const CATALOG_PATH = '/api/frontend/v1/catalog/models'
const ENDPOINTS_PATH = '/api/frontend/v1/stats/endpoint'

// Endpoint reads dominate a catalog refresh. This bounds pressure on OpenRouter while still
// allowing independent model endpoint sets to be fetched in parallel.
const READ_CONCURRENCY = 12

/** OpenRouter exposes variants as separate endpoint sets but reuses the base display names. */
const displayName = (name: string, variant: string) =>
  variant === 'standard' ? name : `${name} (${variant})`

/**
 * The embedded model is authoritative for this model endpoint set, but its base identity
 * fields do not describe non-standard variants. Heal those fields from the endpoint row before
 * exposing the model downstream.
 */
const normalizeEmbeddedModel = (row: UpstreamEndpoint): ModelVariant => ({
  ...row.model,
  name: displayName(row.model.name, row.variant),
  permaslug: row.model_variant_permaslug,
  short_name: displayName(row.model.short_name, row.variant),
  slug: row.model_variant_slug,
  variant: row.variant,
})

// The embedded model is duplicated on every endpoint and has not been healed. Strip only that
// known transport duplication; all other fields pass through because the upstream shape churns.
const normalizeEndpoint = ({ model: _model, ...endpoint }: UpstreamEndpoint): Endpoint => endpoint

/** Builds the stable `{ model, endpoints }` shape and enforces its non-empty endpoint invariant. */
const normalizeModelEndpoints = Effect.fn('OpenRouterClient.normalizeModelEndpoints')(
  function* normalizeModelEndpoints(
    sourceModel: UpstreamCatalogEntry,
    rows: ReadonlyArray<UpstreamEndpoint>,
  ): Effect.fn.Return<ModelEndpoints, OpenRouterClientError> {
    const variant = sourceModel.endpoint?.variant
    if (variant === undefined) {
      return yield* new OpenRouterClientError({
        cause: new Error('Cannot normalize a catalog entry without an endpoint variant'),
        operation: 'normalize',
        scope: sourceModel.permaslug,
      })
    }

    const [first] = rows
    if (first === undefined) {
      return yield* new OpenRouterClientError({
        cause: new Error('OpenRouter returned no endpoints for a current catalog model'),
        operation: 'normalize',
        scope: `${sourceModel.permaslug}:${variant}`,
      })
    }

    return {
      endpoints: rows.map(normalizeEndpoint),
      model: normalizeEmbeddedModel(first),
    }
  },
)

const make = Effect.gen(function* make() {
  // Retry only failures classified as transient by Effect's HTTP client. Permanent HTTP statuses
  // remain explicit decisions below rather than being hidden inside generic retry behavior.
  const client = (yield* HttpClient.HttpClient).pipe(
    HttpClient.mapRequest(HttpClientRequest.acceptJson),
    HttpClient.retryTransient({
      schedule: Schedule.exponential('1 second'),
      times: 3,
    }),
  )

  const readEndpoints = Effect.fn('OpenRouterClient.readEndpoints')(function* readEndpoints(
    model: UpstreamCatalogEntry,
  ): Effect.fn.Return<ModelEndpoints | undefined, OpenRouterClientError> {
    const variant = model.endpoint?.variant
    if (variant === undefined) {
      return yield* new OpenRouterClientError({
        cause: new Error('Catalog entry has no current endpoint variant'),
        operation: 'endpoints',
        scope: model.permaslug,
      })
    }

    const response = yield* client
      .get(`${BASE_URL}${ENDPOINTS_PATH}`, {
        urlParams: { permaslug: model.permaslug, variant },
      })
      .pipe(
        Effect.mapError(
          (cause) =>
            new OpenRouterClientError({
              cause,
              operation: 'endpoints',
              scope: `${model.permaslug}:${variant}`,
            }),
        ),
      )

    // A current model can disappear between the catalog and endpoint reads. It no longer belongs
    // in this snapshot, so record the race operationally and omit it.
    if (response.status === 404) {
      yield* Effect.logWarning('openrouter: current catalog model had no endpoints').pipe(
        Effect.annotateLogs({
          permaslug: model.permaslug,
          phase: 'openrouter-endpoints',
          variant,
        }),
      )
      return undefined
    }
    if (response.status < 200 || response.status >= 300) {
      return yield* new OpenRouterClientError({
        cause: new Error(`OpenRouter endpoints returned HTTP ${response.status}`),
        operation: 'endpoints',
        scope: `${model.permaslug}:${variant}`,
      })
    }

    const { data } = yield* HttpClientResponse.schemaBodyJson(UpstreamEndpointsResponse)(
      response,
    ).pipe(
      Effect.mapError(
        (cause) =>
          new OpenRouterClientError({
            cause,
            operation: 'endpoints',
            scope: `${model.permaslug}:${variant}`,
          }),
      ),
    )
    return yield* normalizeModelEndpoints(model, data)
  })

  const read: Effect.Effect<Inventory, OpenRouterClientError> = Effect.gen(function* read() {
    const response = yield* client
      .get(`${BASE_URL}${CATALOG_PATH}`)
      .pipe(Effect.mapError((cause) => new OpenRouterClientError({ cause, operation: 'catalog' })))
    if (response.status < 200 || response.status >= 300) {
      return yield* new OpenRouterClientError({
        cause: new Error(`OpenRouter catalog returned HTTP ${response.status}`),
        operation: 'catalog',
      })
    }

    const { data } = yield* HttpClientResponse.schemaBodyJson(
      Schema.Struct({ data: Schema.Array(UpstreamCatalogEntry) }),
    )(response).pipe(
      Effect.mapError((cause) => new OpenRouterClientError({ cause, operation: 'catalog' })),
    )

    // A non-null endpoint summary is OpenRouter's signal that the model currently has endpoints
    // worth querying. Tilde-prefixed slugs are upstream non-public catalog entries.
    const currentModels = data.filter(
      (model) => model.endpoint !== null && !model.slug.startsWith('~'),
    )
    const modelEndpointResults = yield* Effect.forEach(currentModels, readEndpoints, {
      concurrency: READ_CONCURRENCY,
    })
    // `undefined` represents a model that disappeared during the catalog/endpoints read window.
    const modelEndpoints = modelEndpointResults.filter((result) => result !== undefined)
    const observedAt = DateTime.formatIso(yield* DateTime.now)

    yield* Effect.logInfo('catalog: read accepted upstream data').pipe(
      Effect.annotateLogs({
        endpoints: String(
          modelEndpoints.reduce((count, entry) => count + entry.endpoints.length, 0),
        ),
        models: String(modelEndpoints.length),
        phase: 'catalog-read',
      }),
    )

    return { modelEndpoints, observedAt }
  }).pipe(Effect.withSpan('OpenRouterClient.read'))

  return OpenRouterClient.of({ read })
})

/**
 * Reads a current, normalized OpenRouter catalog snapshot.
 *
 * The service encapsulates upstream routing, decoding, retry, filtering, and model healing. Its
 * `read` effect fails with `OpenRouterClientError` when a usable snapshot cannot be produced.
 * Use `layer` for the default fetch client or `layerNoDeps` to supply an HTTP client explicitly.
 */
export class OpenRouterClient extends Context.Service<
  OpenRouterClient,
  {
    readonly read: Effect.Effect<Inventory, OpenRouterClientError>
  }
>()('@orca/openrouter/OpenRouterClient') {
  static readonly layerNoDeps = Layer.effect(this, make)
  static readonly layer = this.layerNoDeps.pipe(Layer.provide(FetchHttpClient.layer))
}

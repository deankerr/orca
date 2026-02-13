/**
 * Effect-based crawl prototype
 *
 * This is a standalone prototype exploring Effect for the crawl pipeline.
 * It mirrors the existing crawl logic but uses Effect's type-safe error handling,
 * HTTP client, schema validation, and composable service patterns.
 *
 * Not integrated into the production pipeline — invoked via a separate action.
 */
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from '@effect/platform'
import { Context, Effect, Layer, Schema, Schedule } from 'effect'

// ---------------------------------------------------------------------------
// Schema definitions (Effect Schema equivalents of the Zod schemas)
// ---------------------------------------------------------------------------

/**
 * We use Schema.Record + Schema.Unknown for the "loose object" pattern.
 * The crawl intentionally validates minimally — just enough to confirm the
 * response shape — and preserves the raw data for downstream processing.
 */
const DataRecord = Schema.Record({ key: Schema.String, value: Schema.Unknown })
type DataRecord = typeof DataRecord.Type

/** Wrapper: `{ data: Record<string, unknown> }` → extracts `data` */
const DataRecordEnvelope = Schema.transform(
  Schema.Struct({ data: DataRecord }),
  DataRecord,
  {
    decode: (envelope) => envelope.data,
    encode: (data) => ({ data }),
  },
)

/** Wrapper: `{ data: Record<string, unknown>[] }` → extracts `data` */
const DataRecordArrayEnvelope = Schema.transform(
  Schema.Struct({ data: Schema.Array(DataRecord) }),
  Schema.Array(DataRecord),
  {
    decode: (envelope) => envelope.data,
    encode: (data) => ({ data }),
  },
)

/** Minimal model shape — just what we need to navigate the crawl */
const ModelMinimal = Schema.Struct({
  slug: Schema.String,
  permaslug: Schema.String,
  author: Schema.String,
  endpoint: Schema.NullOr(
    Schema.Struct({
      variant: Schema.String,
    }),
  ),
})
type ModelMinimal = typeof ModelMinimal.Type

/** `{ data: ModelMinimal[] }` → `ModelMinimal[]` */
const ModelsEnvelope = Schema.transform(
  Schema.Struct({
    data: Schema.Array(
      // Allow extra fields (open schema) — equivalent to z.looseObject
      Schema.extend(ModelMinimal, Schema.Struct({}, { key: Schema.String, value: Schema.Unknown })),
    ),
  }),
  Schema.Array(ModelMinimal),
  {
    decode: (envelope) =>
      envelope.data.map((m) => ({
        slug: m.slug,
        permaslug: m.permaslug,
        author: m.author,
        endpoint: m.endpoint,
      })),
    encode: (data) => ({ data }),
  },
)

const EndpointMinimal = Schema.Struct({
  id: Schema.String,
})
type EndpointMinimal = typeof EndpointMinimal.Type

/** `{ data: EndpointMinimal[] }` → `EndpointMinimal[]` */
const EndpointsEnvelope = Schema.transform(
  Schema.Struct({
    data: Schema.Array(
      Schema.extend(EndpointMinimal, Schema.Struct({}, { key: Schema.String, value: Schema.Unknown })),
    ),
  }),
  Schema.Array(EndpointMinimal),
  {
    decode: (envelope) => envelope.data.map((e) => ({ id: e.id })),
    encode: (data) => ({ data }),
  },
)

// ---------------------------------------------------------------------------
// Tagged error types
// ---------------------------------------------------------------------------

/** HTTP-level failure (network, timeout, non-2xx) */
class CrawlHttpError {
  readonly _tag = 'CrawlHttpError' as const
  constructor(
    readonly url: string,
    readonly cause: unknown,
  ) {}
}

/** Response body didn't match expected schema */
class CrawlParseError {
  readonly _tag = 'CrawlParseError' as const
  constructor(
    readonly url: string,
    readonly cause: unknown,
  ) {}
}

// ---------------------------------------------------------------------------
// OpenRouter API service
// ---------------------------------------------------------------------------

/** The service interface: typed methods for each API call we make */
class OpenRouterApi extends Context.Tag('OpenRouterApi')<
  OpenRouterApi,
  {
    readonly fetchProviders: () => Effect.Effect<
      readonly DataRecord[],
      CrawlHttpError | CrawlParseError
    >
    readonly fetchModels: () => Effect.Effect<
      readonly ModelMinimal[],
      CrawlHttpError | CrawlParseError
    >
    readonly fetchEndpoints: (
      permaslug: string,
      variant: string,
    ) => Effect.Effect<readonly EndpointMinimal[], CrawlHttpError | CrawlParseError>
    readonly fetchUptimes: (
      endpointId: string,
    ) => Effect.Effect<DataRecord, CrawlHttpError | CrawlParseError>
    readonly fetchTopApps: (
      permaslug: string,
      variant: string,
    ) => Effect.Effect<DataRecord, CrawlHttpError | CrawlParseError>
    readonly fetchAnalytics: () => Effect.Effect<DataRecord, CrawlHttpError | CrawlParseError>
  }
>() {}

/**
 * Helper: make a GET request with schema-validated JSON response.
 * Wraps both HTTP and parse errors into our tagged error types.
 */
const apiGet = <A, I>(
  client: HttpClient.HttpClient,
  path: string,
  schema: Schema.Schema<A, I>,
  params?: Record<string, string>,
) =>
  Effect.gen(function* () {
    const request = HttpClientRequest.get(path).pipe(
      params ? HttpClientRequest.setUrlParams(params) : (r) => r,
    )

    const response = yield* client.execute(request).pipe(
      Effect.mapError((e) => new CrawlHttpError(path, e)),
    )

    return yield* HttpClientResponse.schemaBodyJson(schema)(response).pipe(
      Effect.mapError((e) => new CrawlParseError(path, e)),
    )
  }).pipe(Effect.scoped)

/** Live implementation using HttpClient with retries and base URL */
const OpenRouterApiLive = Layer.effect(
  OpenRouterApi,
  Effect.gen(function* () {
    const baseClient = (yield* HttpClient.HttpClient).pipe(
      HttpClient.mapRequest(HttpClientRequest.prependUrl('https://openrouter.ai')),
      HttpClient.filterStatusOk,
      HttpClient.retryTransient({
        schedule: Schedule.exponential('1 second').pipe(Schedule.compose(Schedule.recurs(2))),
      }),
    )

    return {
      fetchProviders: () => apiGet(baseClient, '/api/frontend/all-providers', DataRecordArrayEnvelope),

      fetchModels: () => apiGet(baseClient, '/api/frontend/models', ModelsEnvelope),

      fetchEndpoints: (permaslug, variant) =>
        apiGet(baseClient, '/api/frontend/stats/endpoint', EndpointsEnvelope, { permaslug, variant }),

      fetchUptimes: (endpointId) =>
        apiGet(baseClient, '/api/frontend/stats/uptime-hourly', DataRecordEnvelope, { id: endpointId }),

      fetchTopApps: (permaslug, variant) =>
        apiGet(baseClient, '/api/frontend/stats/top-apps-for-model', DataRecordEnvelope, {
          permaslug,
          variant,
        }),

      fetchAnalytics: () => apiGet(baseClient, '/api/frontend/models/find', DataRecordEnvelope),
    }
  }),
)

// ---------------------------------------------------------------------------
// Crawl bundle types (matching existing CrawlArchiveBundle structure)
// ---------------------------------------------------------------------------

type ModelCrawlResult = {
  model: ModelMinimal
  endpoints: EndpointMinimal[]
  uptimes: Array<[string, DataRecord]>
  apps: DataRecord[] // deprecated, always empty
  topApps?: DataRecord
}

export type EffectCrawlResult = {
  crawl_id: string
  args: { uptimes: boolean; topApps: boolean; analytics: boolean }
  data: {
    models: ModelCrawlResult[]
    providers: DataRecord[]
    modelAuthors: DataRecord[] // deprecated, always empty
    analytics?: DataRecord
  }
  /** Errors that were recovered from (logged, not fatal) */
  recoveredErrors: Array<{ tag: string; url: string; message: string }>
}

// ---------------------------------------------------------------------------
// Crawl workflow (the Effect program)
// ---------------------------------------------------------------------------

/**
 * Fetch all data for a single model (endpoints + optional uptimes/topApps).
 * Errors on individual fetches are caught and logged, not fatal.
 */
const fetchModelData = (
  model: ModelMinimal,
  opts: { uptimes: boolean; topApps: boolean },
) =>
  Effect.gen(function* () {
    const api = yield* OpenRouterApi

    const result: ModelCrawlResult = {
      model,
      endpoints: [],
      uptimes: [],
      apps: [],
    }

    const errors: EffectCrawlResult['recoveredErrors'] = []

    if (!model.endpoint) {
      return { result, errors }
    }

    const { permaslug, endpoint } = model

    // Fetch endpoints
    const endpointsResult = yield* api.fetchEndpoints(permaslug, endpoint.variant).pipe(
      Effect.either,
    )
    if (endpointsResult._tag === 'Right') {
      result.endpoints = [...endpointsResult.right]
    } else {
      const err = endpointsResult.left
      errors.push({ tag: err._tag, url: `endpoints:${permaslug}`, message: String(err.cause) })
    }

    // Fetch uptimes (sequential per endpoint, matching existing behavior)
    if (opts.uptimes && result.endpoints.length > 0) {
      for (const ep of result.endpoints) {
        const uptimeResult = yield* api.fetchUptimes(ep.id).pipe(Effect.either)
        if (uptimeResult._tag === 'Right') {
          result.uptimes.push([ep.id, uptimeResult.right])
        } else {
          const err = uptimeResult.left
          errors.push({ tag: err._tag, url: `uptimes:${ep.id}`, message: String(err.cause) })
        }
      }
    }

    // Fetch topApps
    if (opts.topApps) {
      const topAppsResult = yield* api
        .fetchTopApps(permaslug, endpoint.variant)
        .pipe(Effect.either)
      if (topAppsResult._tag === 'Right') {
        result.topApps = topAppsResult.right
      } else {
        const err = topAppsResult.left
        errors.push({ tag: err._tag, url: `topApps:${permaslug}`, message: String(err.cause) })
      }
    }

    return { result, errors }
  })

/**
 * The full crawl program. Composes all API calls and collects results.
 *
 * Requirements: OpenRouterApi service (provided via layer at runtime)
 */
export const crawlProgram = (args: { uptimes: boolean; topApps: boolean; analytics: boolean }) =>
  Effect.gen(function* () {
    const api = yield* OpenRouterApi
    const crawl_id = Date.now().toString()

    yield* Effect.log(`[effect-crawl] starting`, { crawl_id, ...args })

    const bundle: EffectCrawlResult = {
      crawl_id,
      args,
      data: {
        models: [],
        providers: [],
        modelAuthors: [],
      },
      recoveredErrors: [],
    }

    // --- Providers ---
    const providersResult = yield* api.fetchProviders().pipe(Effect.either)
    if (providersResult._tag === 'Right') {
      bundle.data.providers = [...providersResult.right]
    } else {
      const err = providersResult.left
      bundle.recoveredErrors.push({ tag: err._tag, url: 'providers', message: String(err.cause) })
      yield* Effect.log(`[effect-crawl:providers] failed`, { error: String(err.cause) })
    }

    // --- Models + per-model data ---
    const models = yield* api.fetchModels().pipe(
      // Models fetch is critical — if it fails, the whole crawl fails
      Effect.mapError(
        (e) => new CrawlHttpError('models', `Critical: models fetch failed — ${String(e.cause)}`),
      ),
    )

    yield* Effect.log(`[effect-crawl] fetched ${models.length} models`)

    for (const model of models) {
      const { result, errors } = yield* fetchModelData(model, {
        uptimes: args.uptimes,
        topApps: args.topApps,
      })
      bundle.data.models.push(result)
      bundle.recoveredErrors.push(...errors)
    }

    // --- Analytics ---
    if (args.analytics) {
      const analyticsResult = yield* api.fetchAnalytics().pipe(Effect.either)
      if (analyticsResult._tag === 'Right') {
        bundle.data.analytics = analyticsResult.right
      } else {
        const err = analyticsResult.left
        bundle.recoveredErrors.push({ tag: err._tag, url: 'analytics', message: String(err.cause) })
        yield* Effect.log(`[effect-crawl:analytics] failed`, { error: String(err.cause) })
      }
    }

    yield* Effect.log(`[effect-crawl] complete`, {
      crawl_id,
      models: bundle.data.models.length,
      endpoints: bundle.data.models.reduce((sum, m) => sum + m.endpoints.length, 0),
      providers: bundle.data.providers.length,
      recoveredErrors: bundle.recoveredErrors.length,
    })

    return bundle
  })

// ---------------------------------------------------------------------------
// Layer composition
// ---------------------------------------------------------------------------

/**
 * Complete layer stack for running the crawl.
 * FetchHttpClient.layer provides the standard `fetch` implementation,
 * which is available in Convex actions.
 */
export const CrawlLive = OpenRouterApiLive.pipe(Layer.provide(FetchHttpClient.layer))

// ---------------------------------------------------------------------------
// Runner: the bridge from Effect-land back to Promise-land
// ---------------------------------------------------------------------------

/**
 * Execute the crawl program and return a plain JS result.
 * This is what the Convex action calls.
 */
export const runEffectCrawl = (args: {
  uptimes: boolean
  topApps: boolean
  analytics: boolean
}): Promise<EffectCrawlResult> =>
  Effect.runPromise(crawlProgram(args).pipe(Effect.provide(CrawlLive)))

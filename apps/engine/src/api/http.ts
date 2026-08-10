// * The engine's HTTP surface: one declared API over the archive.
// *
// * Declared rather than routed by hand, so the path params, the query params and every response
// * body are schemas — one description that validates requests, encodes responses and generates the
// * OpenAPI document served at `/openapi.json` and browsable at `/docs`. A caller can derive a typed
// * client from it; nothing here restates a shape that `@orca/schema` already holds.
import {
  ArtifactName,
  ArtifactPage,
  Author,
  BatchDetail,
  BatchId,
  BatchPage,
  CrawlStarted,
} from '@orca/schema/artifacts.ts'
import type * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Path from 'effect/Path'
import * as Schema from 'effect/Schema'
import * as Etag from 'effect/unstable/http/Etag'
import * as HttpPlatform from 'effect/unstable/http/HttpPlatform'
import * as HttpRouter from 'effect/unstable/http/HttpRouter'
import * as HttpServerError from 'effect/unstable/http/HttpServerError'
import * as HttpServerResponse from 'effect/unstable/http/HttpServerResponse'
import * as HttpApi from 'effect/unstable/httpapi/HttpApi'
import * as HttpApiBuilder from 'effect/unstable/httpapi/HttpApiBuilder'
import * as HttpApiEndpoint from 'effect/unstable/httpapi/HttpApiEndpoint'
import * as HttpApiError from 'effect/unstable/httpapi/HttpApiError'
import * as HttpApiGroup from 'effect/unstable/httpapi/HttpApiGroup'
import * as HttpApiScalar from 'effect/unstable/httpapi/HttpApiScalar'
import * as HttpApiSchema from 'effect/unstable/httpapi/HttpApiSchema'
import * as OpenApi from 'effect/unstable/httpapi/OpenApi'

import type { Archive } from '../archive/store.ts'
import type { Current } from '../current/cache.ts'

// * ── request shapes ────────────────────────────────────────────────────────────────────────────

// * R2 pages at 1,000 keys and defaults to ~20, so a limit is never left implicit. 100 is a page a
// * human can read; a machine walking the archive will say what it wants.
const Paging = Schema.Struct({
  limit: Schema.optional(
    Schema.NumberFromString.check(Schema.isInt(), Schema.isBetween({ maximum: 1000, minimum: 1 })),
  ).annotateKey({ description: 'keys per page, 1–1000 (default 100)' }),

  // * R2's cursor, passed back verbatim. Opaque on purpose: it is not a key, an offset, or a
  // * timestamp, and treating it as any of those will break.
  cursor: Schema.optional(Schema.String).annotateKey({
    description: 'the `cursor` from the previous page',
  }),
})

const BatchParam = Schema.Struct({ batch: BatchId })

const ArtifactParams = Schema.Struct({ batch: BatchId, name: ArtifactName })

// * `author` narrows the listing prefix, which is the one filter this layout can answer cheaply.
// * Anything else — a status, a slug pattern — would be a scan, and belongs downstream.
const EndpointsQuery = Schema.Struct({
  ...Paging.fields,
  author: Schema.optional(Author).annotateKey({
    description: 'restrict to one author, e.g. `anthropic`',
  }),
})

// * Stored documents are served as the bytes we stored, streamed rather than parsed: the catalog is
// * 4 MB, and nothing in the engine has any business reading either shape.
const StoredDocument = HttpApiSchema.StreamUint8Array({ contentType: 'application/json' })

// * ── endpoints ─────────────────────────────────────────────────────────────────────────────────

const listBatches = HttpApiEndpoint.get('listBatches', '/batches', {
  query: Paging,
  success: BatchPage,
}).annotate(OpenApi.Description, 'Every crawl, oldest first.')

// * Static, so it wins over `/batches/:batch` — and cannot collide with a real batch id, which is
// * always a timestamp.
const getLatest = HttpApiEndpoint.get('getLatest', '/batches/latest', {
  error: HttpApiError.NotFound,
  success: BatchDetail,
}).annotate(OpenApi.Description, 'The most recent crawl. 404 while the archive is empty.')

const getBatch = HttpApiEndpoint.get('getBatch', '/batches/:batch', {
  error: HttpApiError.NotFound,
  params: BatchParam,
  success: BatchDetail,
}).annotate(
  OpenApi.Description,
  'One crawl: what it planned from, and what landed at which statuses.',
)

const getCatalog = HttpApiEndpoint.get('getCatalog', '/batches/:batch/catalog', {
  error: HttpApiError.NotFound,
  params: BatchParam,
  success: StoredDocument,
}).annotate(OpenApi.Description, "The catalog the crawl planned from — the batch's denominator.")

const listEndpoints = HttpApiEndpoint.get('listEndpoints', '/batches/:batch/endpoints', {
  error: HttpApiError.NotFound,
  params: BatchParam,
  query: EndpointsQuery,
  success: ArtifactPage,
}).annotate(OpenApi.Description, 'The endpoints responses that landed in one crawl.')

const getEndpoints = HttpApiEndpoint.get('getEndpoints', '/batches/:batch/endpoints/:name', {
  error: HttpApiError.NotFound,
  params: ArtifactParams,
  success: StoredDocument,
}).annotate(OpenApi.Description, 'One stored endpoints response, exactly as it was stored.')

// * ⚠️ Unauthenticated, like everything else here. It is the one endpoint with a cost attached: it
// * queues a full crawl of OpenRouter.
const postCrawl = HttpApiEndpoint.post('postCrawl', '/crawl', {
  success: CrawlStarted,
}).annotate(OpenApi.Description, 'Start a crawl now, in addition to the hourly one.')

const archiveGroup = HttpApiGroup.make('archive')
  .add(listBatches)
  .add(getLatest)
  .add(getBatch)
  .add(getCatalog)
  .add(listEndpoints)
  .add(getEndpoints)
  .add(postCrawl)

// * ── current cache ─────────────────────────────────────────────────────────────────────────────
// * Disposable worker-side observation cache in D1 (ScopeObservation per scope). Counts only on
// * the HTTP surface for now — enough to prove migrations and Effect SQL are live. Product
// * delivery is a later adapter; this is not the grid document store.

const CurrentStatus = Schema.Struct({
  available: Schema.Number,
  endpoints: Schema.Number,
  models: Schema.Number,
})

const getCurrentStatus = HttpApiEndpoint.get('getCurrentStatus', '/current', {
  success: CurrentStatus,
}).annotate(
  OpenApi.Description,
  'Row counts for the D1 current observation cache (scopes, endpoints, available endpoints).',
)

const currentGroup = HttpApiGroup.make('current').add(getCurrentStatus)

export class EngineApi extends HttpApi.make('orca-engine')
  .add(archiveGroup)
  .add(currentGroup)
  .annotate(OpenApi.Title, 'ORCA engine')
  .annotate(
    OpenApi.Description,
    'The archive of OpenRouter responses, plus the disposable D1 current observation cache.',
  ) {}

// * ── handlers ──────────────────────────────────────────────────────────────────────────────────

const DEFAULT_LIMIT = 100

// * A missing object and a missing crawl are the same answer to a caller: the thing you named is not
// * in the archive.
const orNotFound = <A>(value: A | null) =>
  value === null ? Effect.fail(new HttpApiError.NotFound()) : Effect.succeed(value)

type Services = {
  archive: Archive
  crawl: Effect.Effect<CrawlStarted>
  current: Current
}

const archiveHandlers = (services: Services) =>
  HttpApiBuilder.group(EngineApi, 'archive', (group) =>
    group
      .handle('listBatches', ({ query }) =>
        services.archive.batches({ cursor: query.cursor, limit: query.limit ?? DEFAULT_LIMIT }),
      )
      .handle('getLatest', () =>
        services.archive.latest().pipe(
          Effect.flatMap(orNotFound),
          Effect.flatMap((batch) => services.archive.detail(batch)),
          Effect.flatMap(orNotFound),
        ),
      )
      .handle('getBatch', ({ params }) =>
        services.archive.detail(params.batch).pipe(Effect.flatMap(orNotFound)),
      )
      .handle('getCatalog', ({ params }) =>
        services.archive.readCatalog(params.batch).pipe(Effect.flatMap(orNotFound)),
      )
      .handle('listEndpoints', ({ params, query }) =>
        services.archive.endpoints({
          author: query.author,
          batch: params.batch,
          cursor: query.cursor,
          limit: query.limit ?? DEFAULT_LIMIT,
        }),
      )
      .handle('getEndpoints', ({ params }) =>
        services.archive
          .readEndpoints({ batch: params.batch, name: params.name })
          .pipe(Effect.flatMap(orNotFound)),
      )
      .handle('postCrawl', () => services.crawl),
  )

const currentHandlers = (services: Services) =>
  HttpApiBuilder.group(EngineApi, 'current', (group) =>
    group.handle('getCurrentStatus', () => services.current.status),
  )

// * ── serving ───────────────────────────────────────────────────────────────────────────────────

// * `HttpApiBuilder` asks for the platform's file-response surface, because an API *may* answer with
// * a file. This one never does, and a Worker has no filesystem to answer from — so the real platform
// * layer sits on a filesystem that refuses every call, which is reachable only down a path no route
// * here takes.
const WorkerPlatform = Layer.mergeAll(
  Etag.layer,
  Path.layer,
  HttpPlatform.layer,
  // * merged, not just provided: `HttpApiBuilder` asks for the filesystem in its own right
  FileSystem.layerNoop({}),
).pipe(Layer.provide(FileSystem.layerNoop({})))

// * ⚠️ Not every answer arrives as a response. A request that fails to decode is a *defect* carrying
// * the 400 it wants to be, and an unmatched path is a failure carrying a 404 — effect's own server
// * layers render both, and Alchemy's Worker bridge does not: it logs whatever it catches and answers
// * a bare 500. `causeResponse` is that renderer, so a bad batch id reads as a bad request and a wrong
// * path as a wrong path.
// *
// * Only a 5xx is logged. A 400 or a 404 is an answer, not a fault.
const respond = Effect.catchCause((cause: Cause.Cause<unknown>) =>
  HttpServerError.causeResponse(cause).pipe(
    Effect.flatMap(([response, reported]) =>
      response.status >= 500
        ? Effect.logError('engine request failed', reported).pipe(Effect.as(response))
        : Effect.succeed(response),
    ),
  ),
)

// * The Worker's `fetch` handler: the API, its OpenAPI document, and a Scalar reference page for
// * reading it. Scalar is loaded from a CDN rather than bundled — the alternative puts half a
// * megabyte of documentation UI inside the Worker.
// *
// * ⚠️ Flattened, so the router is built per request rather than once at init. That is what a Worker
// * gives us: building it needs a `Scope`, and the only scope on offer is the request's.
export const handler = (services: Services) =>
  Layer.mergeAll(
    HttpApiBuilder.layer(EngineApi, { openapiPath: '/openapi.json' }).pipe(
      Layer.provide(archiveHandlers(services)),
      Layer.provide(currentHandlers(services)),
    ),
    HttpApiScalar.layerCdn(EngineApi, { path: '/docs' }),
    // * The root is where someone with no context arrives. Send them to the reference rather than
    // * answering 404 at the one path a human is most likely to try first.
    HttpRouter.add('GET', '/', HttpServerResponse.redirect('/docs')),
  ).pipe(
    Layer.provide(WorkerPlatform),
    HttpRouter.toHttpEffect,
    Effect.map(respond),
    Effect.flatten,
  )

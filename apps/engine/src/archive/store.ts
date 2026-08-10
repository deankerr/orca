// * The archive: everything the crawl stores and everything the API navigates, behind one interface.
// *
// * It is the only module that knows how a key is spelled, and the only one that touches R2. Both
// * halves of the engine come through here — the crawl writes, the API reads — which is what keeps
// * the layout a single decision. See README.md for the layout itself and the trade it makes.
import type {
  Artifact,
  ArtifactName,
  Author,
  Batch,
  BatchDetail,
  BatchId,
  EndpointsQuery,
} from '@orca/schema/artifacts.ts'
// * The same module again, as values: the ids are schemas as well as types, and this module parses
// * with them as much as it types with them.
import * as ArtifactSchema from '@orca/schema/artifacts.ts'
import type * as Cloudflare from 'alchemy/Cloudflare'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import * as Stream from 'effect/Stream'

import { fromBinding } from '../runtime/binding.ts'

// * R2's own ceiling for one listing page. Used by the internal scans; what the API asks for is its
// * caller's business.
const PAGE_LIMIT = 1000

// * ⚠️ Sync on purpose, throughout this module. Every one of these reads or writes data that is ours,
// * so a failure is a bug in the engine rather than something a caller could handle — and inside an
// * `Effect.fn` body a thrown error is already a defect.
const readCatalogObservation = Schema.decodeUnknownSync(ArtifactSchema.CatalogObservation)
const readEndpointsObservation = Schema.decodeUnknownSync(ArtifactSchema.EndpointsObservation)
const writeCatalogObservation = Schema.encodeSync(ArtifactSchema.CatalogObservation)
const writeEndpointsObservation = Schema.encodeSync(ArtifactSchema.EndpointsObservation)
const readBatchId = Schema.decodeUnknownSync(ArtifactSchema.BatchId)
const readArtifactName = Schema.decodeUnknownSync(ArtifactSchema.ArtifactName)

// * ── keys ──────────────────────────────────────────────────────────────────────────────────────
// * The whole key grammar, in one place, taking parsed ids only.

const CATALOG_PREFIX = 'catalog/'

const SUFFIX = '.json'

const catalogKey = (batch: BatchId) => `${CATALOG_PREFIX}${batch}${SUFFIX}`

const batchPrefix = (batch: BatchId) => `endpoints/${batch}/`

// * ⚠️ The `.` separators read well but do not parse: model names contain dots of their own
// * (`gpt-3.5-turbo`). Identity is recovered from metadata, never from the name.
const artifactName = (query: EndpointsQuery) =>
  readArtifactName(`${query.permaslug.replaceAll('/', '.')}.${query.variant}`)

const artifactKey = (batch: BatchId, name: ArtifactName) => `${batchPrefix(batch)}${name}${SUFFIX}`

// * The name a key ends with, back out of it. Parsed rather than asserted, so a key that does not fit
// * the grammar this module writes says so here.
const nameIn = (key: string, prefix: string) =>
  readArtifactName(key.slice(prefix.length, -SUFFIX.length))

const batchIn = (key: string) => readBatchId(key.slice(CATALOG_PREFIX.length, -SUFFIX.length))

export type Archive = ReturnType<typeof make>

export const make = (bucket: Cloudflare.R2.ReadWriteBucketClient) => {
  // * Binding edge: see ../runtime/binding.ts. R2 failures are defects for archive callers.

  // * ── listing ─────────────────────────────────────────────────────────────────────────────────

  // * One page, with the cursor normalised to `null` at the end of the listing. R2's `truncated` flag
  // * and its cursor are the same fact stated twice; callers get the useful one.
  const page = Effect.fn(function* page(options: {
    prefix: string
    limit: number
    cursor: string | undefined
  }) {
    // * ⚠️ A variable, not a literal argument: `include` is absent from the R2 types Alchemy ships
    // * (workers-types v4 dropped it, v5 has it back) and a fresh literal would be rejected for it.
    // * The binding honours it, and without it every `customMetadata` comes back undefined — which is
    // * where identity and status live.
    const query = {
      cursor: options.cursor,
      include: ['customMetadata'],
      limit: options.limit,
      prefix: options.prefix,
    }

    const listing = yield* fromBinding(bucket.list(query))

    return {
      cursor: listing.truncated ? listing.cursor : null,
      objects: listing.objects,
    }
  })

  // * Every object under a prefix, following the cursor to its end. Only for the counting paths: a
  // * batch is ~430 objects and a page holds 1,000, so this is one request in practice.
  const scan = Effect.fnUntraced(function* scan(prefix: string) {
    const objects: Effect.Success<ReturnType<typeof page>>['objects'][number][] = []
    let cursor: string | undefined

    do {
      const listing = yield* page({ cursor, limit: PAGE_LIMIT, prefix })
      objects.push(...listing.objects)
      cursor = listing.cursor ?? undefined
    } while (cursor !== undefined)

    return objects
  })

  // * ── reading ─────────────────────────────────────────────────────────────────────────────────

  // * The stored document, streamed. A read that fails part-way through a body is a defect, not a
  // * response: nothing useful can be said to a caller already receiving bytes.
  const read = Effect.fn(function* read(key: string) {
    const object = yield* fromBinding(bucket.get(key))
    return object === null ? null : object.body.pipe(Stream.orDie)
  })

  // * A crawl, as its stored catalog describes it. `null` when no such crawl exists — the catalog is
  // * written before anything is queued, so its absence is the absence of the batch.
  const describe = Effect.fn(function* describe(batch: BatchId) {
    const object = yield* fromBinding(bucket.head(catalogKey(batch)))
    if (object === null) {
      return null
    }

    const observation = readCatalogObservation(object.customMetadata)
    return { batch, bytes: object.size, observed_at: observation.observed_at } satisfies Batch
  })

  return {
    // * ── writes ────────────────────────────────────────────────────────────────────────────────

    // * The batch's denominator, stored before anything is queued: the `endpoints/` prefix records
    // * what landed, the catalog records what should have.
    putCatalog: Effect.fn(function* putCatalog(args: { batch: BatchId; body: string }) {
      const observation = { observed_at: yield* DateTime.now, status: 200 }

      yield* fromBinding(
        bucket.put(catalogKey(args.batch), args.body, {
          customMetadata: writeCatalogObservation(observation),
          httpMetadata: { contentType: 'application/json' },
        }),
      )

      yield* Effect.log(`stored catalog ${args.batch} (${args.body.length} bytes)`)
    }),

    // * One endpoints response, at whatever status it settled on. A settled error is stored like any
    // * other observation: the endpoints API cannot say "zero endpoints", so the error is sometimes
    // * the only encoding of a real state.
    putEndpoints: Effect.fn(function* putEndpoints(args: {
      query: EndpointsQuery
      body: string
      status: number
    }) {
      const name = artifactName(args.query)
      const observation = {
        observed_at: yield* DateTime.now,
        permaslug: args.query.permaslug,
        status: args.status,
        variant: args.query.variant,
      }

      yield* fromBinding(
        bucket.put(artifactKey(args.query.batch, name), args.body, {
          customMetadata: writeEndpointsObservation(observation),
          httpMetadata: { contentType: 'application/json' },
        }),
      )

      yield* Effect.log(
        `stored ${args.query.batch}/${name} (${args.status}, ${args.body.length} b)`,
      )
    }),

    // * ── navigation ────────────────────────────────────────────────────────────────────────────

    // * Crawls, oldest first, one page at a time. Enumerated from `catalog/` rather than from
    // * `endpoints/` with a delimiter: one key per crawl is the cheap listing, and Alchemy's
    // * non-binding R2 layers silently drop delimited prefixes anyway.
    batches: Effect.fn(function* batches(args: { limit: number; cursor: string | undefined }) {
      const listing = yield* page({ ...args, prefix: CATALOG_PREFIX })

      const items = listing.objects.map(
        (object): Batch => ({
          batch: batchIn(object.key),
          bytes: object.size,
          observed_at: readCatalogObservation(object.customMetadata).observed_at,
        }),
      )

      return { cursor: listing.cursor, items }
    }),

    // * The most recent crawl. ⚠️ R2 lists forward only, so this walks `catalog/` to its end — one
    // * request per 1,000 crawls, which is one per 41 days of hourly crawling. When that stops being
    // * cheap the answer is a pointer object, not a cleverer listing.
    latest: Effect.fn(function* latest() {
      const objects = yield* scan(CATALOG_PREFIX)
      const last = objects.at(-1)
      return last === undefined ? null : batchIn(last.key)
    }),

    // * One crawl, counted: what it planned from, and what landed under it at which statuses.
    detail: Effect.fn(function* detail(batch: BatchId) {
      const catalog = yield* describe(batch)
      if (catalog === null) {
        return null
      }

      const objects = yield* scan(batchPrefix(batch))
      const statuses: Record<string, number> = {}
      let bytes = 0

      for (const object of objects) {
        bytes += object.size
        const status = String(readEndpointsObservation(object.customMetadata).status)
        statuses[status] = (statuses[status] ?? 0) + 1
      }

      return {
        batch,
        catalog,
        endpoints: { bytes, objects: objects.length, statuses },
      } satisfies BatchDetail
    }),

    // * The responses that landed in one crawl, one page at a time. `author` narrows the prefix
    // * rather than filtering a page, so it is a cheaper listing and not just a smaller one.
    endpoints: Effect.fn(function* endpoints(args: {
      batch: BatchId
      author: Author | undefined
      limit: number
      cursor: string | undefined
    }) {
      const prefix = batchPrefix(args.batch)
      const listing = yield* page({
        cursor: args.cursor,
        limit: args.limit,
        prefix: args.author === undefined ? prefix : `${prefix}${args.author}.`,
      })

      const items = listing.objects.map((object): Artifact => {
        const observation = readEndpointsObservation(object.customMetadata)

        return {
          bytes: object.size,
          name: nameIn(object.key, prefix),
          observed_at: observation.observed_at,
          permaslug: observation.permaslug,
          status: observation.status,
          variant: observation.variant,
        }
      })

      return { cursor: listing.cursor, items }
    }),

    // * ── documents ─────────────────────────────────────────────────────────────────────────────
    // * Stored bytes, unread. Nothing in the engine parses an endpoints response.

    readCatalog: (batch: BatchId) => read(catalogKey(batch)),

    readEndpoints: (args: { batch: BatchId; name: ArtifactName }) =>
      read(artifactKey(args.batch, args.name)),
  }
}

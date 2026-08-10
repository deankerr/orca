// * Observation archive over R2. Sole owner of the bucket binding; key spelling lives in ./keys.ts.
// * Crawl writes, API reads — both go through this interface.
import type {
  Artifact,
  ArtifactName,
  Author,
  Batch,
  BatchDetail,
  BatchId,
  EndpointsQuery,
} from '@orca/schema/artifacts.ts'
import * as ArtifactSchema from '@orca/schema/artifacts.ts'
import type * as Cloudflare from 'alchemy/Cloudflare'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import * as Stream from 'effect/Stream'

import { fromBinding } from '../runtime/binding.ts'
import * as Keys from './keys.ts'

const PAGE_LIMIT = 1000

// * Sync codecs: metadata is ours; failure is an engine bug (defect inside Effect.fn).
const readCatalogObservation = Schema.decodeUnknownSync(ArtifactSchema.CatalogObservation)
const readEndpointsObservation = Schema.decodeUnknownSync(ArtifactSchema.EndpointsObservation)
const writeCatalogObservation = Schema.encodeSync(ArtifactSchema.CatalogObservation)
const writeEndpointsObservation = Schema.encodeSync(ArtifactSchema.EndpointsObservation)

export type Archive = ReturnType<typeof make>

export const make = (bucket: Cloudflare.R2.ReadWriteBucketClient) => {
  // * Binding edge: R2 failures are defects for archive callers (see ../runtime/binding.ts).

  const page = Effect.fn(function* page(options: {
    prefix: string
    limit: number
    cursor: string | undefined
  }) {
    // * `include` missing from Alchemy's R2 types (workers-types v4); assign to a variable so TS
    // * does not reject a fresh literal. Without it, customMetadata is always undefined.
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

  const read = Effect.fn(function* read(key: string) {
    const object = yield* fromBinding(bucket.get(key))
    return object === null ? null : object.body.pipe(Stream.orDie)
  })

  const describe = Effect.fn(function* describe(batch: BatchId) {
    const object = yield* fromBinding(bucket.head(Keys.catalogKey(batch)))
    if (object === null) {
      return null
    }

    const observation = readCatalogObservation(object.customMetadata)
    return { batch, bytes: object.size, observed_at: observation.observed_at } satisfies Batch
  })

  return {
    putCatalog: Effect.fn(function* putCatalog(args: { batch: BatchId; body: string }) {
      const observation = { observed_at: yield* DateTime.now, status: 200 }

      yield* fromBinding(
        bucket.put(Keys.catalogKey(args.batch), args.body, {
          customMetadata: writeCatalogObservation(observation),
          httpMetadata: { contentType: 'application/json' },
        }),
      )

      yield* Effect.log(`stored catalog ${args.batch} (${args.body.length} bytes)`)
    }),

    // * Every settled status, including errors — endpoints API has no "zero endpoints" body.
    putEndpoints: Effect.fn(function* putEndpoints(args: {
      query: EndpointsQuery
      body: string
      status: number
    }) {
      const name = Keys.artifactName(args.query)
      const observation = {
        observed_at: yield* DateTime.now,
        permaslug: args.query.permaslug,
        status: args.status,
        variant: args.query.variant,
      }

      yield* fromBinding(
        bucket.put(Keys.artifactKey(args.query.batch, name), args.body, {
          customMetadata: writeEndpointsObservation(observation),
          httpMetadata: { contentType: 'application/json' },
        }),
      )

      yield* Effect.log(
        `stored ${args.query.batch}/${name} (${args.status}, ${args.body.length} b)`,
      )
    }),

    // * Enumerated from catalog/ (one key per crawl). Not endpoints/ + delimiter — HTTP R2 layers
    // * drop delimited prefixes.
    batches: Effect.fn(function* batches(args: { limit: number; cursor: string | undefined }) {
      const listing = yield* page({ ...args, prefix: Keys.CATALOG_PREFIX })

      const items = listing.objects.map(
        (object): Batch => ({
          batch: Keys.batchIn(object.key),
          bytes: object.size,
          observed_at: readCatalogObservation(object.customMetadata).observed_at,
        }),
      )

      return { cursor: listing.cursor, items }
    }),

    // * R2 lists forward only — walks catalog/ to the end. Pointer object when that gets expensive.
    latest: Effect.fn(function* latest() {
      const objects = yield* scan(Keys.CATALOG_PREFIX)
      const last = objects.at(-1)
      return last === undefined ? null : Keys.batchIn(last.key)
    }),

    detail: Effect.fn(function* detail(batch: BatchId) {
      const catalog = yield* describe(batch)
      if (catalog === null) {
        return null
      }

      const objects = yield* scan(Keys.batchPrefix(batch))
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

    // * `author` narrows the key prefix (cheap listing, not a filter scan).
    endpoints: Effect.fn(function* endpoints(args: {
      batch: BatchId
      author: Author | undefined
      limit: number
      cursor: string | undefined
    }) {
      const prefix = Keys.batchPrefix(args.batch)
      const listing = yield* page({
        cursor: args.cursor,
        limit: args.limit,
        prefix: args.author === undefined ? prefix : `${prefix}${args.author}.`,
      })

      const items = listing.objects.map((object): Artifact => {
        const observation = readEndpointsObservation(object.customMetadata)

        return {
          bytes: object.size,
          name: Keys.nameIn(object.key, prefix),
          observed_at: observation.observed_at,
          permaslug: observation.permaslug,
          status: observation.status,
          variant: observation.variant,
        }
      })

      return { cursor: listing.cursor, items }
    }),

    readCatalog: (batch: BatchId) => read(Keys.catalogKey(batch)),

    readEndpoints: (args: { batch: BatchId; name: ArtifactName }) =>
      read(Keys.artifactKey(args.batch, args.name)),
  }
}

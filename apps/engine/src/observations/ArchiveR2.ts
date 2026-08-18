// * R2 implementation of ObservationArchive. Storage layout and payloads are unchanged.
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import { ObservationsBucket } from '../resources/ObservationsBucket.ts'
import { ObservationArchive } from './Archive.ts'
import { ObservationArchiveError } from './ArchiveError.ts'
import { gunzip, gzip } from './Gzip.ts'
import * as Key from './Key.ts'

const archiveError = (operation: 'read' | 'write', key: string) => (cause: unknown) =>
  new ObservationArchiveError({ cause, key, operation, reason: 'storage' })

/** R2 implementation before its native Worker binding is supplied. */
export const layerR2NoDeps = Layer.effect(
  ObservationArchive,
  Effect.gen(function* makeObservationArchiveR2() {
    const resource = yield* ObservationsBucket
    const bucket = yield* Cloudflare.R2.ReadWriteBucket(resource)

    const putGzip = Effect.fn(function* putGzip(
      key: string,
      body: string,
      metadata: Record<string, string>,
    ) {
      const bytes = yield* gzip(body)
      yield* bucket
        .put(key, bytes, {
          customMetadata: metadata,
          httpMetadata: {
            contentEncoding: 'gzip',
            contentType: 'application/json',
          },
        })
        .pipe(Effect.mapError(archiveError('write', key)))

      yield* Effect.log('observations: stored').pipe(
        Effect.annotateLogs({
          bytes: String(bytes.byteLength),
          key,
          phase: 'observations',
          rawBytes: String(body.length),
        }),
      )
    })

    return ObservationArchive.of({
      putObservation: Effect.fn(function* putObservation(args) {
        yield* putGzip(Key.observationKey(args.observedAt, args.scopeKey), args.body, {
          observed_at: args.observedAt,
          permaslug: args.permaslug,
          status: String(args.status),
          variant: args.variant,
        })
      }),

      getObservation: Effect.fn(function* getObservation(ref) {
        const key = Key.observationKey(ref.observedAt, ref.scopeKey)
        const object = yield* bucket.get(key).pipe(Effect.mapError(archiveError('read', key)))
        if (object === null) {
          return yield* new ObservationArchiveError({
            key,
            operation: 'read',
            reason: 'not-found',
          })
        }
        const bytes = yield* object.arrayBuffer().pipe(Effect.mapError(archiveError('read', key)))
        return yield* gunzip(bytes)
      }),

      putCatalog: Effect.fn(function* putCatalog(args) {
        yield* putGzip(Key.catalogKey(args.observedAt), args.body, {
          kind: 'catalog',
          observed_at: args.observedAt,
        })
      }),
    })
  }),
)

/** R2 archive plus its native, least-privilege Worker binding. */
export const layerR2 = layerR2NoDeps.pipe(Layer.provide(Cloudflare.R2.ReadWriteBucketBinding))

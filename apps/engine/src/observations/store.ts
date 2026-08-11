// * Read/write raw capture evidence on the Observations bucket.
// * Shared archive service: capture writes; sinks (and others) read by ref.
import type * as Cloudflare from 'alchemy/Cloudflare'
import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'

import { fromBinding } from '../binding.ts'
import { gunzip, gzip } from './compress.ts'
import * as Key from './key.ts'
import type { ObservationRef } from './ref.ts'

export type Store = ReturnType<typeof make>

class ObservationNotFound extends Data.TaggedError('ObservationNotFound')<{
  readonly key: string
}> {}

export const make = (bucket: Cloudflare.R2.ReadWriteBucketClient) => {
  const putGzip = (key: string, body: string, metadata: Record<string, string>) =>
    Effect.gen(function* putGzip() {
      const bytes = yield* gzip(body)
      yield* fromBinding(
        bucket.put(key, bytes, {
          customMetadata: metadata,
          httpMetadata: {
            contentEncoding: 'gzip',
            contentType: 'application/json',
          },
        }),
      )
      yield* Effect.log('observations: stored').pipe(
        Effect.annotateLogs({
          bytes: String(bytes.byteLength),
          key,
          phase: 'observations',
          rawBytes: String(body.length),
        }),
      )
    })

  return {
    /** One endpoints observation. Key = endpoints/{observedAt}/{scopeKey}.json.gz */
    putObservation: Effect.fn(function* putObservation(args: {
      observedAt: string
      scopeKey: string
      permaslug: string
      variant: string
      status: number
      /** Validated success envelope JSON (`{ data: [...] }`). */
      body: string
    }) {
      yield* putGzip(Key.observationKey(args.observedAt, args.scopeKey), args.body, {
        observed_at: args.observedAt,
        permaslug: args.permaslug,
        status: String(args.status),
        variant: args.variant,
      })
    }),

    /** Read one endpoints observation body (gunzipped JSON text) by ref. */
    getObservation: Effect.fn(function* getObservation(ref: ObservationRef) {
      const key = Key.observationKey(ref.observedAt, ref.scopeKey)
      const object = yield* fromBinding(bucket.get(key))
      if (object === null) {
        return yield* new ObservationNotFound({ key })
      }
      const bytes = yield* fromBinding(object.arrayBuffer())
      return yield* gunzip(bytes)
    }),

    /** Catalog inventory. Key = catalogs/{observedAt}.json.gz */
    putCatalog: Effect.fn(function* putCatalog(args: { observedAt: string; body: string }) {
      yield* putGzip(Key.catalogKey(args.observedAt), args.body, {
        kind: 'catalog',
        observed_at: args.observedAt,
      })
    }),
  }
}

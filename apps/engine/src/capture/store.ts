// * Read/write raw capture bytes on Observations.
import type * as Cloudflare from 'alchemy/Cloudflare'
import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'

import { fromBinding } from '../binding.ts'
import { gunzip, gzip } from './compress.ts'
import * as Key from './key.ts'

export type Store = ReturnType<typeof make>

export class ObservationNotFound extends Data.TaggedError('ObservationNotFound')<{
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
      yield* Effect.log(`stored ${key} (${body.length} → ${bytes.byteLength} B)`)
    })

  return {
    /** One endpoints observation. Key = endpoints/{observedAt}/{scopeKey}.json.gz */
    putObservation: Effect.fn(function* putObservation(args: {
      observedAt: string
      scopeKey: string
      permaslug: string
      variant: string
      status: number
      /** Upstream response body text, unmodified. */
      body: string
    }) {
      yield* putGzip(Key.observationKey(args.observedAt, args.scopeKey), args.body, {
        observed_at: args.observedAt,
        permaslug: args.permaslug,
        status: String(args.status),
        variant: args.variant,
      })
    }),

    /**
     * Read one endpoints observation body (gunzipped JSON text).
     * Used by the Sinks consumer — messages carry R2 refs, not bodies.
     */
    getObservation: Effect.fn(function* getObservation(args: {
      observedAt: string
      scopeKey: string
    }) {
      const key = Key.observationKey(args.observedAt, args.scopeKey)
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

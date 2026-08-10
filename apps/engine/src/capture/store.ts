// * Write raw capture bytes to Observations. No listings, no archive browser — put only.
import type * as Cloudflare from 'alchemy/Cloudflare'
import * as Effect from 'effect/Effect'

import { fromBinding } from '../binding.ts'
import { gzip } from './compress.ts'
import * as Key from './key.ts'

export type Store = ReturnType<typeof make>

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
    /** One endpoints observation. Key = {observedAt}/{scopeKey}.json.gz */
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

    /** Catalog snapshot under the same temporal prefix. Optional inventory. */
    putCatalog: Effect.fn(function* putCatalog(args: { observedAt: string; body: string }) {
      yield* putGzip(Key.catalogKey(args.observedAt), args.body, {
        kind: 'catalog',
        observed_at: args.observedAt,
      })
    }),
  }
}

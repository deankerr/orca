import type * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Schema from 'effect/Schema'

import { gzip } from './Gzip.ts'
import { InventoryStoreError } from './InventoryStoreError.ts'
import { Inventory } from './Schemas.ts'

const currentKey = 'models/current.json'
const archiveKey = (inventory: Inventory) =>
  `models/archive/${inventory.observedAt.slice(0, 10)}.json.gz`

const encodeInventory = Schema.encodeUnknownEffect(Schema.fromJsonString(Inventory))
const decodeInventory = Schema.decodeUnknownEffect(Schema.fromJsonString(Inventory))

type CurrentResult =
  | { readonly _tag: 'Empty' }
  | { readonly _tag: 'Unchanged' }
  | {
      readonly _tag: 'Update'
      readonly etag: string
      readonly inventory: Inventory
    }

/**
 * Stores the current OpenRouter inventory and its coarse daily archive in shared R2 data storage.
 * All callers use the same object paths, codecs, metadata, and conditional-read behavior.
 * @effect-expect-leaking RuntimeContext
 */
export class InventoryStore extends Context.Service<
  InventoryStore,
  {
    current: (
      projectedEtag?: string,
    ) => Effect.Effect<CurrentResult, InventoryStoreError, Alchemy.RuntimeContext>
    publish: (
      inventory: Inventory,
    ) => Effect.Effect<
      { readonly etag: string; readonly observedAt: string },
      InventoryStoreError,
      Alchemy.RuntimeContext
    >
  }
>()('@orca/inventory/InventoryStore') {
  static readonly layerNoDeps = Layer.effect(
    this,
    Effect.gen(function* layerNoDeps() {
      const resource = yield* Cloudflare.R2.Bucket.ref('InventoryData', { stack: 'OrcaInventory' })
      const bucket = yield* Cloudflare.R2.ReadWriteBucket(resource)

      const current = Effect.fn('InventoryStore.current')(function* current(
        projectedEtag?: string,
      ): Effect.fn.Return<CurrentResult, InventoryStoreError, Alchemy.RuntimeContext> {
        const object = yield* (
          projectedEtag === undefined
            ? bucket.get(currentKey)
            : bucket.get(currentKey, { onlyIf: { etagDoesNotMatch: projectedEtag } })
        ).pipe(
          Effect.mapError((cause) => new InventoryStoreError({ cause, operation: 'read-current' })),
        )

        if (object === null) {
          return { _tag: 'Empty' }
        }
        if (!('text' in object)) {
          return { _tag: 'Unchanged' }
        }

        const body = yield* object
          .text()
          .pipe(
            Effect.mapError(
              (cause) => new InventoryStoreError({ cause, operation: 'read-current' }),
            ),
          )
        const inventory = yield* decodeInventory(body).pipe(
          Effect.mapError(
            (cause) => new InventoryStoreError({ cause, operation: 'decode-current' }),
          ),
        )

        return { _tag: 'Update', etag: object.etag, inventory }
      })

      const publish = Effect.fn('InventoryStore.publish')(function* publish(
        inventory: Inventory,
      ): Effect.fn.Return<
        { readonly etag: string; readonly observedAt: string },
        InventoryStoreError,
        Alchemy.RuntimeContext
      > {
        const dailyKey = archiveKey(inventory)
        const encoded = yield* encodeInventory(inventory).pipe(
          Effect.mapError((cause) => new InventoryStoreError({ cause, operation: 'encode' })),
        )
        const compressed = yield* gzip(encoded).pipe(
          Effect.mapError(
            (cause) => new InventoryStoreError({ cause, operation: 'compress-archive' }),
          ),
        )
        const stored = yield* Effect.all(
          {
            archive: bucket
              .put(dailyKey, compressed, {
                httpMetadata: {
                  contentEncoding: 'gzip',
                  contentType: 'application/json',
                },
              })
              .pipe(
                Effect.mapError(
                  (cause) => new InventoryStoreError({ cause, operation: 'write-archive' }),
                ),
              ),
            current: bucket
              .put(currentKey, encoded, {
                customMetadata: { observedAt: inventory.observedAt },
                httpMetadata: { contentType: 'application/json' },
              })
              .pipe(
                Effect.mapError(
                  (cause) => new InventoryStoreError({ cause, operation: 'write-current' }),
                ),
              ),
          },
          { concurrency: 'unbounded' },
        )

        yield* Effect.logInfo('inventory: published current and daily archive').pipe(
          Effect.annotateLogs({
            archiveKey: dailyKey,
            etag: stored.current.etag,
            observedAt: inventory.observedAt,
            phase: 'inventory-publish',
          }),
        )

        return {
          etag: stored.current.etag,
          observedAt: inventory.observedAt,
        }
      })

      return InventoryStore.of({ current, publish })
    }),
  )

  static readonly layer = this.layerNoDeps.pipe(Layer.provide(Cloudflare.R2.ReadWriteBucketBinding))
}

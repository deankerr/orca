import type * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Context from 'effect/Context'
import * as Data from 'effect/Data'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Predicate from 'effect/Predicate'
import * as Schema from 'effect/Schema'

import { gzip } from './Gzip.ts'
import { InventoryStoreError } from './InventoryStoreError.ts'
import { Inventory } from './Schemas.ts'

const currentKey = 'models/current.json'

// Catalog writes ISO `observedAt`. The archive key is that instant's UTC calendar day.
const archiveKey = (inventory: Inventory) => {
  const observedAt = DateTime.makeUnsafe(inventory.observedAt)
  return `models/archive/${DateTime.formatIsoDateUtc(observedAt)}.json.gz`
}

const InventoryJson = Schema.fromJsonString(Inventory)
const encodeInventory = Schema.encodeEffect(InventoryJson)
const decodeInventory = Schema.decodeEffect(InventoryJson)

type CurrentResult = Data.TaggedEnum<{
  Empty: {}
  Unchanged: {}
  Update: { readonly etag: string; readonly inventory: Inventory }
}>

const CurrentResult = Data.taggedEnum<CurrentResult>()

/**
 * Stores the current OpenRouter inventory and its coarse daily archive in shared R2 data storage.
 * All callers use the same object paths, codecs, metadata, and conditional-read behavior.
 *
 * @effect-expect-leaking RuntimeContext
 */
export class InventoryStore extends Context.Service<
  InventoryStore,
  {
    /** Conditional read of `models/current.json`. Missing is `Empty`, not a failure. */
    current: (
      projectedEtag?: string,
    ) => Effect.Effect<CurrentResult, InventoryStoreError, Alchemy.RuntimeContext>
    /** Replace current and the UTC-day archive. */
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

      const current = Effect.fn('InventoryStore.current')(
        function* current(projectedEtag?: string) {
          const object = yield* projectedEtag === undefined
            ? bucket.get(currentKey)
            : bucket.get(currentKey, { onlyIf: { etagDoesNotMatch: projectedEtag } })

          if (object === null) {
            return CurrentResult.Empty()
          }

          // onlyIf matched the stored etag: R2 returns metadata without a body.
          if (!Predicate.hasProperty(object, 'text')) {
            return CurrentResult.Unchanged()
          }

          const body = yield* object.text()
          const inventory = yield* decodeInventory(body)
          return CurrentResult.Update({ etag: object.etag, inventory })
        },
        Effect.mapError((cause) => new InventoryStoreError({ cause })),
      )

      const publish = Effect.fn('InventoryStore.publish')(
        function* publish(inventory: Inventory) {
          const dailyKey = archiveKey(inventory)
          const encoded = yield* encodeInventory(inventory)
          const compressed = yield* gzip(encoded)

          const writeArchive = bucket.put(dailyKey, compressed, {
            httpMetadata: {
              contentEncoding: 'gzip',
              contentType: 'application/json',
            },
          })

          const writeCurrent = bucket.put(currentKey, encoded, {
            customMetadata: { observedAt: inventory.observedAt },
            httpMetadata: { contentType: 'application/json' },
          })

          const stored = yield* Effect.all(
            { archive: writeArchive, current: writeCurrent },
            { concurrency: 'unbounded' },
          )

          yield* Effect.logInfo('inventory: published current and daily archive').pipe(
            Effect.annotateLogs({
              archiveKey: dailyKey,
              etag: stored.current.etag,
              observedAt: inventory.observedAt,
            }),
          )

          return {
            etag: stored.current.etag,
            observedAt: inventory.observedAt,
          }
        },
        Effect.mapError((cause) => new InventoryStoreError({ cause })),
      )

      return InventoryStore.of({ current, publish })
    }),
  )

  // `provide` satisfies the R2 binding privately. Callers of `layer` only see InventoryStore.
  static readonly layer = this.layerNoDeps.pipe(Layer.provide(Cloudflare.R2.ReadWriteBucketBinding))
}

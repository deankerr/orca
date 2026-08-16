import type { Inventory } from '@orca/inventory'
import type * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'

import { PublicApiV2Error } from './PublicApiV2Error.ts'
import { ModelsResponse } from './schema.ts'
import { projectModelEndpoints } from './transform.ts'

const currentKey = 'models/public-api-v2/current.json'

const encodeResponse = Schema.encodeUnknownEffect(Schema.fromJsonString(ModelsResponse))

/**
 * Legacy V2 projection: catalog materializes it after each inventory publish;
 * the Worker serves the last successfully written object.
 *
 * @effect-expect-leaking RuntimeContext
 */
export class PublicApiV2 extends Context.Service<
  PublicApiV2,
  {
    /** Stored JSON body. An Effect value — `yield* publicApiV2.getModels`. */
    getModels: Effect.Effect<string, PublicApiV2Error, Alchemy.RuntimeContext>
    materialize: (
      inventory: Inventory,
    ) => Effect.Effect<void, PublicApiV2Error, Alchemy.RuntimeContext>
  }
>()('@orca/public-api-v2/PublicApiV2') {
  static readonly layerNoDeps = Layer.effect(
    this,
    Effect.gen(function* layerNoDeps() {
      const resource = yield* Cloudflare.R2.Bucket.ref('InventoryData', { stack: 'OrcaInventory' })
      const bucket = yield* Cloudflare.R2.ReadWriteBucket(resource)

      // 0-arg work is an Effect, not a function. `Effect.fn` would wrap it in `() => Effect`
      // and trip `lazy-effect`; `Effect.gen` + `withSpan` is the 0-arg form.
      const getModels = Effect.gen(function* getModels() {
        const object = yield* bucket.get(currentKey)
        if (object === null) {
          return yield* new PublicApiV2Error({ cause: 'current object is missing' })
        }

        // Serve stored bytes as-is. A tightened schema must not take down a payload we already wrote.
        return yield* object.text()
      }).pipe(
        Effect.catchTag('R2Error', (cause) => new PublicApiV2Error({ cause })),
        Effect.withSpan('PublicApiV2.getModels'),
      )

      const materialize = Effect.fn('PublicApiV2.materialize')(
        function* materialize(inventory: Inventory) {
          const models = inventory.modelEndpoints.flatMap((modelEndpoints) =>
            Option.toArray(projectModelEndpoints(modelEndpoints)),
          )

          const encoded = yield* encodeResponse({
            models,
            updated_at: inventory.observedAt,
          })

          yield* bucket.put(currentKey, encoded, {
            customMetadata: { observedAt: inventory.observedAt },
            httpMetadata: { contentType: 'application/json' },
          })

          yield* Effect.logInfo('public-api-v2: materialized').pipe(
            Effect.annotateLogs({
              models: models.length,
              observedAt: inventory.observedAt,
            }),
          )
        },
        // Extra Effect.fn arguments are combinators. Do not `.pipe` the fn itself.
        Effect.mapError((cause) => new PublicApiV2Error({ cause })),
      )

      return PublicApiV2.of({ getModels, materialize })
    }),
  )

  // `provide` satisfies the R2 binding privately. Callers of `layer` only see PublicApiV2.
  static readonly layer = this.layerNoDeps.pipe(Layer.provide(Cloudflare.R2.ReadWriteBucketBinding))
}

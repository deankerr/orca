import { InventoryStore } from '@orca/inventory'
import type { InventoryStoreError } from '@orca/inventory'
import type * as Alchemy from 'alchemy'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'

import { ProjectionStore } from './ProjectionStore.ts'
import type { ProjectionStoreError } from './ProjectionStoreError.ts'
import type { ModelsResponse } from './schema.ts'
import { projectModelEndpoints } from './transform.ts'

/**
 * Pulls catalog into the V2 projection and serves the last completed projection.
 * @effect-expect-leaking RuntimeContext
 */
export class PublicApiV2 extends Context.Service<
  PublicApiV2,
  {
    getModels: (args?: {
      readonly limit?: number
    }) => Effect.Effect<ModelsResponse, ProjectionStoreError, Alchemy.RuntimeContext>
    refresh: Effect.Effect<void, InventoryStoreError | ProjectionStoreError, Alchemy.RuntimeContext>
  }
>()('@orca/public-api-v2/PublicApiV2') {
  static readonly layerNoDeps = Layer.effect(
    this,
    Effect.gen(function* layerNoDeps() {
      const inventoryStore = yield* InventoryStore
      const projectionStore = yield* ProjectionStore

      const refresh = Effect.gen(function* refresh() {
        const projectedEtag = yield* projectionStore.projectedEtag
        const current = yield* inventoryStore.current(projectedEtag)

        if (current._tag !== 'Update') {
          return
        }
        const { etag, inventory } = current

        const projectedModels = inventory.modelEndpoints.flatMap((modelEndpoints) =>
          Option.toArray(projectModelEndpoints(modelEndpoints)),
        )
        yield* projectionStore.replace({
          etag,
          models: projectedModels,
          observedAt: inventory.observedAt,
        })

        yield* Effect.logInfo('public-api-v2: refreshed projection').pipe(
          Effect.annotateLogs({
            models: String(projectedModels.length),
            observedAt: inventory.observedAt,
            phase: 'public-api-v2-refresh',
            sourceEtag: etag,
          }),
        )
      }).pipe(Effect.withSpan('PublicApiV2.refresh'))

      return PublicApiV2.of({ getModels: projectionStore.getModels, refresh })
    }),
  )

  static readonly layer = this.layerNoDeps.pipe(
    Layer.provide(Layer.merge(InventoryStore.layer, ProjectionStore.layer)),
  )
}

import { InventoryStore } from '@orca/inventory'
import { OpenRouterClient } from '@orca/openrouter'
import { PublicApiV2 } from '@orca/public-api-v2'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

export default class CatalogWorkflow extends Cloudflare.Workflow<CatalogWorkflow>()(
  'CatalogRun',
  // Init runs once per isolate. `yield*` a Service class to take its
  // implementation from the Layer provided at the bottom of this file.
  Effect.gen(function* init() {
    const openRouter = yield* OpenRouterClient
    const inventoryStore = yield* InventoryStore
    const publicApiV2 = yield* PublicApiV2

    return Effect.fn('CatalogWorkflow.run')(function* run() {
      const { instanceId: runId } = yield* Cloudflare.Workflows.WorkflowEvent

      // Cloudflare checkpoints every task result with a 1 MiB limit. Keep the large catalog
      // inventory inside this task and persist only the small storage receipts as Workflow state.
      //
      // `orDie` turns remaining typed errors into defects so Cloudflare retries the whole
      // publication. V2 materialize is caught *before* that, so a bad projection cannot
      // fail or retry inventory publish, and cannot overwrite the previous V2 object.
      return yield* Cloudflare.Workflows.task(
        'publish-inventory',
        Effect.gen(function* publishInventory() {
          const inventory = yield* openRouter.read
          const published = yield* inventoryStore.publish(inventory)
          const publicApiV2Status = yield* publicApiV2.materialize(inventory).pipe(
            // On success, discard `void` and keep a small receipt for the checkpoint.
            Effect.as('written' as const),
            // `catch` handles typed `PublicApiV2Error` only, not defects.
            Effect.catch((error) =>
              Effect.logWarning('catalog: public-api-v2 materialize skipped').pipe(
                Effect.annotateLogs({
                  cause: String(error),
                  runId,
                }),
                Effect.as('skipped' as const),
              ),
            ),
          )
          return { ...published, publicApiV2: publicApiV2Status }
        }).pipe(Effect.annotateLogs({ runId }), Effect.orDie),
        {
          retries: { backoff: 'exponential', delay: '10 seconds', limit: 3 },
          timeout: '15 minutes',
        },
      )
    })
  }).pipe(
    Effect.provide(Layer.mergeAll(OpenRouterClient.layer, InventoryStore.layer, PublicApiV2.layer)),
  ),
) {}

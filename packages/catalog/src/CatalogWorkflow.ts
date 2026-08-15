import { InventoryStore } from '@orca/inventory'
import { OpenRouterClient } from '@orca/openrouter'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

export default class CatalogWorkflow extends Cloudflare.Workflow<CatalogWorkflow>()(
  'CatalogRun',
  Effect.gen(function* init() {
    const openRouter = yield* OpenRouterClient
    const inventoryStore = yield* InventoryStore

    return Effect.fn('CatalogWorkflow.run')(function* run() {
      const { instanceId: runId } = yield* Cloudflare.Workflows.WorkflowEvent

      // Cloudflare checkpoints every task result with a 1 MiB limit. Keep the large catalog
      // inventory inside this task and persist only the small storage receipts as Workflow state.
      // Typed capability errors become defects at this orchestration edge so Cloudflare retries
      // the whole publication attempt.
      return yield* Cloudflare.Workflows.task(
        'publish-inventory',
        Effect.gen(function* publishInventory() {
          const inventory = yield* openRouter.read
          return yield* inventoryStore.publish(inventory)
        }).pipe(Effect.annotateLogs({ runId }), Effect.orDie),
        {
          retries: { backoff: 'exponential', delay: '10 seconds', limit: 3 },
          timeout: '15 minutes',
        },
      )
    })
  }).pipe(Effect.provide(Layer.merge(OpenRouterClient.layer, InventoryStore.layer))),
) {}

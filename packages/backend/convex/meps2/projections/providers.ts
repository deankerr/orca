import { internal } from '../../_generated/api'
import type { ActionCtx } from '../../_generated/server'
import type { CatalogProvider } from '../catalog/v1'
import { applyChunks, rewriteIfEmpty } from './apply/chunks'
import { compareMaps, viewWrites } from './compare'
import type { MapChange } from './compare'

export async function projectProviders(
  ctx: ActionCtx,
  args: {
    before: Map<string, CatalogProvider>
    after: Map<string, CatalogProvider>
    timestamp: number
  },
) {
  const hasRows = await ctx.runQuery(internal.meps2.projections.apply.providers.hasRows, {})
  const changes = compareMaps(args.before, args.after)
  const view = rewriteIfEmpty(hasRows, args.after, viewWrites(changes))

  logProviderChanges(changes, {
    rewrite: view.rewrite,
    upserts: view.upserts.length,
    deletes: view.deletes.length,
  })

  return await applyChunks(
    view.upserts.map((provider) => ({ ...provider, updated_at: args.timestamp })),
    view.deletes,
    async (batch) => await ctx.runMutation(internal.meps2.projections.apply.providers.apply, batch),
  )
}

function logProviderChanges(
  changes: MapChange<CatalogProvider>[],
  counts: { rewrite: boolean; upserts: number; deletes: number },
) {
  console.log('[meps2:providers]', {
    ...counts,
    creates: changes.filter((change) => change.kind === 'create').map((change) => change.id),
    absent: changes.filter((change) => change.kind === 'absent').map((change) => change.id),
  })
  for (const change of changes) {
    if (change.kind === 'update') {
      console.log(`[meps2:providers] update: ${change.id}`, change.changeset)
    }
  }
}

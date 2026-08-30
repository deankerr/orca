import { internal } from '../../_generated/api'
import type { ActionCtx } from '../../_generated/server'
import { loadArtifact } from '../artifacts/storage'
import type { Catalog } from './v1'
import { catalogFile, deserializeCatalog, emptyCatalog } from './v1'

export async function loadBaseline(ctx: ActionCtx, workflow: string): Promise<Catalog> {
  const previous = await ctx.runQuery(internal.meps2.artifacts.queries.getLatestSucceededArtifact, {
    workflow,
  })

  if (previous === null) {
    return emptyCatalog()
  }

  const envelope = await loadArtifact(ctx, previous.storage_id)
  return deserializeCatalog(catalogFile.parse(envelope.data))
}

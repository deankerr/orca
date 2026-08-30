import type { Options as DiffOptions } from 'json-diff-ts'

import { internal } from '../../_generated/api'
import type { ActionCtx } from '../../_generated/server'
import type { CatalogModel } from '../catalog/v1'
import { applyChunks, rewriteIfEmpty } from './apply/chunks'
import { compareMaps, viewWrites } from './compare'
import type { MapChange } from './compare'

const DIFF_OPTIONS: DiffOptions = {
  keysToSkip: ['metadata.updated_at'],
  embeddedObjKeys: {
    input_modalities: '$value',
    output_modalities: '$value',
  },
  treatTypeChangeAsReplace: false,
}

export async function projectModels(
  ctx: ActionCtx,
  args: {
    before: Map<string, CatalogModel>
    after: Map<string, CatalogModel>
    timestamp: number
  },
) {
  const hasRows = await ctx.runQuery(internal.meps2.projections.apply.models.hasRows, {})
  const changes = compareMaps(args.before, args.after, DIFF_OPTIONS)
  const view = rewriteIfEmpty(hasRows, args.after, viewWrites(changes))

  logModelChanges(changes, {
    rewrite: view.rewrite,
    upserts: view.upserts.length,
    deletes: view.deletes.length,
  })

  return await applyChunks(
    view.upserts.map((model) => toModelRow(model, args.timestamp)),
    view.deletes,
    async (batch) => await ctx.runMutation(internal.meps2.projections.apply.models.apply, batch),
  )
}

function toModelRow(model: CatalogModel, updated_at: number) {
  return {
    updated_at,
    model_id: model.model_id,
    variant: model.variant,
    permaslug: model.permaslug,
    input_modalities: model.input_modalities,
    output_modalities: model.output_modalities,
    or_created_at: model.or_created_at,
    display_name: model.display_name,
    author_display_name: model.author_display_name,
    metadata: model.metadata,
  }
}

function logModelChanges(
  changes: MapChange<CatalogModel>[],
  counts: { rewrite: boolean; upserts: number; deletes: number },
) {
  console.log('[meps2:models]', {
    ...counts,
    creates: changes.filter((change) => change.kind === 'create').map((change) => change.id),
    absent: changes.filter((change) => change.kind === 'absent').map((change) => change.id),
  })
  for (const change of changes) {
    if (change.kind === 'update') {
      console.log(`[meps2:models] update: ${change.id}`, change.changeset)
    }
  }
}

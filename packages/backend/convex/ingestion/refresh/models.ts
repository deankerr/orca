import { ConvexError, v } from 'convex/values'
import type { Infer } from 'convex/values'

import { internal } from '#generated/api'
import type { ActionCtx } from '#generated/server'
import { internalMutation, internalQuery } from '#generated/server'
import * as scans from '#scanNew'

import { CURRENT_MODELS_TABLE } from '../../catalog/tables/current'
import { OBSERVATIONS_TABLE } from '../../catalog/tables/observations'
import { compare } from '../../compare'
import schema from '../../schema'
import { currentModel } from '../currentModels'
import { assertReplacement, completedCutoff, currentFacts, locateSource, source } from './shared'
import type { RefreshResult } from './shared'

const entity = schema.doc(CURRENT_MODELS_TABLE)
const snapshot = v.object({ row: entity, as_of: v.string(), source })
type Snapshot = Infer<typeof snapshot>

export const read = internalQuery({
  args: { model_id: v.string() },
  returns: snapshot,
  handler: async (ctx, { model_id }) => {
    const row = await ctx.db
      .query(CURRENT_MODELS_TABLE)
      .withIndex('by_model_id', (q) => q.eq('model_id', model_id))
      .unique()

    if (row === null) {
      throw new ConvexError('Catalog model not found')
    }

    const as_of = await completedCutoff(ctx, row)

    const observation = await ctx.db
      .query(OBSERVATIONS_TABLE)
      .withIndex('by_entity_kind_and_entity_id_and_scan_at', (q) =>
        q.eq('entity_kind', 'model').eq('entity_id', model_id).lte('scan_at', as_of),
      )
      .order('desc')
      .first()

    if (observation?.entity_kind !== 'model') {
      throw new ConvexError({
        message: 'Catalog model has no observation at the completed cutoff',
        entity_kind: 'model',
        entity_id: model_id,
      })
    }

    return {
      row,
      as_of,
      source: await locateSource(ctx, observation.scan_at, observation.detected, as_of),
    }
  },
})

export async function refresh(ctx: ActionCtx, model_id: string): Promise<RefreshResult> {
  const before: Snapshot = await ctx.runQuery(internal.ingestion.refresh.models.read, {
    model_id,
  })

  const scan = await scans.reader(ctx).loadScan(before.source.scan_at)
  const observed = scan.models.get(model_id)

  if (observed === undefined) {
    throw new ConvexError({
      message: 'Entity is absent from its selected source scan',
      entity_kind: 'model',
      entity_id: model_id,
      scan_at: scan.scan_at,
    })
  }

  const { metadata, ...fields } = currentModel(observed)

  const after = {
    ...fields,
    _id: before.row._id,
    _creationTime: before.row._creationTime,
    first_scan_at: before.row.first_scan_at,
    scan_at: scan.scan_at,
    metadata_json: JSON.stringify(metadata),
  }

  const changed: boolean = await ctx.runMutation(internal.ingestion.refresh.models.replace, {
    before,
    after,
  })
  return { changed, source_scan_at: scan.scan_at, source_basis: before.source.basis }
}

export const replace = internalMutation({
  args: { before: snapshot, after: entity },
  returns: v.boolean(),
  handler: async (ctx, { before, after }) => {
    const row = await ctx.db.get(CURRENT_MODELS_TABLE, before.row._id)
    assertReplacement(row, before.row, after, before.as_of)

    if (after.model_id !== before.row.model_id) {
      throw new ConvexError('Replacement changes entity identity')
    }

    if (compare(currentFacts(before.row), currentFacts(after)).length === 0) {
      return false
    }

    const { _id, _creationTime: _created, ...fields } = after
    await ctx.db.replace(CURRENT_MODELS_TABLE, _id, fields)
    return true
  },
})

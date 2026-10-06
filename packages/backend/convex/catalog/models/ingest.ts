import { v } from 'convex/values'

import { internalMutation } from '#generated/server'
import type { MutationCtx } from '#generated/server'

import { assertInitialTableEmpty } from '../../ingestion/initialization'
import type { Scan, ScanPair } from '../../scan'
import { changedRows } from '../changes'
import { projectModel } from '../project'
import { CURRENT_MODELS_TABLE, currentModelsTable } from './table'
import type { CurrentModelRow } from './table'

export function prepare(pair: ScanPair) {
  const project = (scan: Scan) => new Map(initialRows(scan).map((row) => [row.model_id, row]))
  return changedRows(project(pair.previous), project(pair.next))
}

/** Write inside the caller's acceptance transaction. */
export async function write(ctx: MutationCtx, rows: CurrentModelRow[]): Promise<void> {
  for (const row of rows) {
    const existing = await ctx.db
      .query(CURRENT_MODELS_TABLE)
      .withIndex('by_model_id', (q) => q.eq('model_id', row.model_id))
      .unique()

    // Preserve unknown legacy dates too; a later update cannot establish first observation.
    const next: CurrentModelRow = {
      ...row,
      from_scan_at: existing === null ? row.scan_at : existing.from_scan_at,
    }

    await (existing === null
      ? ctx.db.insert(CURRENT_MODELS_TABLE, next)
      : ctx.db.replace(CURRENT_MODELS_TABLE, existing._id, next))
  }
}

export function initialRows(scan: Scan) {
  return [...scan.models.values()].map((model) => projectModel(model, scan.scan_at))
}

export const initialize = internalMutation({
  args: { rows: v.array(currentModelsTable.validator) },
  returns: v.null(),
  handler: async (ctx, { rows }) => {
    await assertInitialTableEmpty(ctx, CURRENT_MODELS_TABLE)
    for (const row of rows) {
      await ctx.db.insert(CURRENT_MODELS_TABLE, { ...row, from_scan_at: row.scan_at })
    }
    return null
  },
})

import { v } from 'convex/values'

import { internalMutation } from '../../../_generated/server'
import type { MutationCtx } from '../../../_generated/server'
import { assertInitialTableEmpty } from '../../ingestion/initialization'
import type { Scan, ScanPair } from '../../scan/extract'
import { changedRows } from '../changes'
import { projectModel } from '../project'
import { V4_CURRENT_MODELS_TABLE, currentModelsTable } from './table'
import type { CurrentModelRow } from './table'

export function prepare(pair: ScanPair) {
  const project = (scan: Scan) => new Map(initialRows(scan).map((row) => [row.model_id, row]))
  return changedRows(project(pair.previous), project(pair.next))
}

/** Write inside the caller's acceptance transaction. */
export async function write(ctx: MutationCtx, rows: CurrentModelRow[]): Promise<void> {
  for (const row of rows) {
    const existing = await ctx.db
      .query(V4_CURRENT_MODELS_TABLE)
      .withIndex('by_model_id', (q) => q.eq('model_id', row.model_id))
      .unique()

    await (existing === null
      ? ctx.db.insert(V4_CURRENT_MODELS_TABLE, row)
      : ctx.db.replace(V4_CURRENT_MODELS_TABLE, existing._id, row))
  }
}

export function initialRows(scan: Scan) {
  return [...scan.models.values()].map((model) => projectModel(model, scan.scan_at))
}

export const initialize = internalMutation({
  args: { rows: v.array(currentModelsTable.validator) },
  returns: v.null(),
  handler: async (ctx, { rows }) => {
    await assertInitialTableEmpty(ctx, V4_CURRENT_MODELS_TABLE)
    for (const row of rows) {
      await ctx.db.insert(V4_CURRENT_MODELS_TABLE, row)
    }
    return null
  },
})

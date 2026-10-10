import { v } from 'convex/values'

import { internalMutation } from '#generated/server'
import type { MutationCtx } from '#generated/server'
import type { Scan, ScanPair } from '#scan/model'

import { assertInitialTableEmpty } from '../../ingestion/initialization'
import { changedRows } from '../changes'
import { encodeModel, projectModel } from '../project'
import { CURRENT_MODELS_TABLE, currentModelsTable } from './table'
import type { CurrentModelRow } from './table'

export function prepare(pair: ScanPair) {
  return changedRows(project(pair.previous), project(pair.next)).map(encodeModel)
}

/** Write inside the caller's acceptance transaction. */
export async function write(
  ctx: MutationCtx,
  rows: Omit<CurrentModelRow, 'first_scan_at'>[],
): Promise<void> {
  for (const row of rows) {
    const existing = await ctx.db
      .query(CURRENT_MODELS_TABLE)
      .withIndex('by_model_id', (q) => q.eq('model_id', row.model_id))
      .unique()

    const next: CurrentModelRow = {
      ...row,
      first_scan_at: existing === null ? row.scan_at : existing.first_scan_at,
    }

    await (existing === null
      ? ctx.db.insert(CURRENT_MODELS_TABLE, next)
      : ctx.db.replace(CURRENT_MODELS_TABLE, existing._id, next))
  }
}

export function initialRows(scan: Scan) {
  return [...project(scan).values()].map(encodeModel)
}

function project(scan: Scan) {
  return new Map([...scan.models].map(([id, model]) => [id, projectModel(model, scan.scan_at)]))
}

export const initialize = internalMutation({
  args: { rows: v.array(currentModelsTable.validator.omit('first_scan_at')) },
  returns: v.null(),
  handler: async (ctx, { rows }) => {
    await assertInitialTableEmpty(ctx, CURRENT_MODELS_TABLE)
    for (const row of rows) {
      await ctx.db.insert(CURRENT_MODELS_TABLE, { ...row, first_scan_at: row.scan_at })
    }
    return null
  },
})

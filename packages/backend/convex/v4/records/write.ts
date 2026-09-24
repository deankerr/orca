import { ConvexError, v } from 'convex/values'

import { internalMutation } from '../../_generated/server'
import type { MutationCtx } from '../../_generated/server'
import { finishStep, stepArgs } from '../ingestion/step'
import { assertScanAt } from '../scan/time'
import { V4_ENTITY_RECORDS_TABLE, entityRecordsTable } from './table'
import type { EntityRecordRow } from './table'

/** Append prepared records. An existing equal row is the committed retry; a different value conflicts. */
export async function appendEntityRecords(
  ctx: MutationCtx,
  rows: readonly EntityRecordRow[],
): Promise<void> {
  for (const row of rows) {
    assertScanAt(row.scan_at)

    if (
      row.entity_kind === 'endpoint' &&
      (row.model_id === undefined || row.provider_id === undefined)
    ) {
      throw new ConvexError(`Endpoint record ${row.entity_id} is missing its relationships`)
    }

    const existing = await ctx.db
      .query(V4_ENTITY_RECORDS_TABLE)
      .withIndex('by_entity_kind_and_entity_id_and_scan_at', (q) =>
        q
          .eq('entity_kind', row.entity_kind)
          .eq('entity_id', row.entity_id)
          .eq('scan_at', row.scan_at),
      )
      .unique()

    if (existing === null) {
      await ctx.db.insert(V4_ENTITY_RECORDS_TABLE, row)
      continue
    }

    if (
      existing.raw_json !== row.raw_json ||
      existing.model_id !== row.model_id ||
      existing.provider_id !== row.provider_id
    ) {
      throw new ConvexError(
        `Conflicting entity record ${row.entity_kind} ${row.entity_id} at ${row.scan_at}`,
      )
    }
  }
}

/** Write this phase's entity records and advance the ingestion. */
export const writeRecords = internalMutation({
  args: { ...stepArgs, rows: v.array(entityRecordsTable.validator) },
  returns: v.string(),
  handler: async (ctx, args) =>
    await finishStep(ctx, { ...args, output: 'records' }, args.rows, appendEntityRecords),
})

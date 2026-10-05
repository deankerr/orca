import { v } from 'convex/values'

import { internalMutation } from '../../_generated/server'
import type { MutationCtx } from '../../_generated/server'
import { assertInitialTableEmpty } from '../../ingestion/initialization'
import type { Scan, ScanPair } from '../../scan'
import { changedRows } from '../changes'
import { projectProvider } from '../project'
import { CURRENT_PROVIDERS_TABLE, currentProvidersTable } from './table'
import type { CurrentProviderRow } from './table'

export function prepare(pair: ScanPair) {
  const project = (scan: Scan) => new Map(initialRows(scan).map((row) => [row.provider_id, row]))
  return changedRows(project(pair.previous), project(pair.next))
}

/** Write inside the caller's acceptance transaction. */
export async function write(ctx: MutationCtx, rows: CurrentProviderRow[]): Promise<void> {
  for (const row of rows) {
    const existing = await ctx.db
      .query(CURRENT_PROVIDERS_TABLE)
      .withIndex('by_provider_id', (q) => q.eq('provider_id', row.provider_id))
      .unique()

    // Preserve unknown legacy dates too; a later update cannot establish first observation.
    const next: CurrentProviderRow = {
      ...row,
      from_scan_at: existing === null ? row.scan_at : existing.from_scan_at,
    }

    await (existing === null
      ? ctx.db.insert(CURRENT_PROVIDERS_TABLE, next)
      : ctx.db.replace(CURRENT_PROVIDERS_TABLE, existing._id, next))
  }
}

export function initialRows(scan: Scan) {
  return [...scan.providers.values()].map((provider) => projectProvider(provider, scan.scan_at))
}

export const initialize = internalMutation({
  args: { rows: v.array(currentProvidersTable.validator) },
  returns: v.null(),
  handler: async (ctx, { rows }) => {
    await assertInitialTableEmpty(ctx, CURRENT_PROVIDERS_TABLE)
    for (const row of rows) {
      await ctx.db.insert(CURRENT_PROVIDERS_TABLE, { ...row, from_scan_at: row.scan_at })
    }
    return null
  },
})

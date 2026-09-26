import { v } from 'convex/values'

import { internalMutation } from '../../../_generated/server'
import type { MutationCtx } from '../../../_generated/server'
import { assertInitialTableEmpty } from '../../ingestion/initialization'
import type { Scan, ScanPair } from '../../scan/extract'
import { changedRows } from '../changes'
import { projectProvider } from '../project'
import { V4_CURRENT_PROVIDERS_TABLE, currentProvidersTable } from './table'
import type { CurrentProviderRow } from './table'

export function prepare(pair: ScanPair) {
  const project = (scan: Scan) => new Map(initialRows(scan).map((row) => [row.provider_id, row]))
  return changedRows(project(pair.previous), project(pair.next))
}

/** Write inside the caller's acceptance transaction. */
export async function write(ctx: MutationCtx, rows: CurrentProviderRow[]): Promise<void> {
  for (const row of rows) {
    const existing = await ctx.db
      .query(V4_CURRENT_PROVIDERS_TABLE)
      .withIndex('by_provider_id', (q) => q.eq('provider_id', row.provider_id))
      .unique()

    await (existing === null
      ? ctx.db.insert(V4_CURRENT_PROVIDERS_TABLE, row)
      : ctx.db.replace(V4_CURRENT_PROVIDERS_TABLE, existing._id, row))
  }
}

export function initialRows(scan: Scan) {
  return [...scan.providers.values()].map((provider) => projectProvider(provider, scan.scan_at))
}

export const initialize = internalMutation({
  args: { rows: v.array(currentProvidersTable.validator) },
  returns: v.null(),
  handler: async (ctx, { rows }) => {
    await assertInitialTableEmpty(ctx, V4_CURRENT_PROVIDERS_TABLE)
    for (const row of rows) {
      await ctx.db.insert(V4_CURRENT_PROVIDERS_TABLE, row)
    }
    return null
  },
})

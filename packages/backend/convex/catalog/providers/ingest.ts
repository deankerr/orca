import { v } from 'convex/values'

import { internalMutation } from '#generated/server'
import type { MutationCtx } from '#generated/server'
import type { Scan, ScanPair } from '#scan/model'

import { assertInitialTableEmpty } from '../../ingestion/initialization'
import { changedRows } from '../changes'
import { encodeProvider, projectProvider } from '../project'
import { CURRENT_PROVIDERS_TABLE, currentProvidersTable } from './table'
import type { CurrentProviderRow } from './table'

export function prepare(pair: ScanPair) {
  return changedRows(project(pair.previous), project(pair.next)).map(encodeProvider)
}

/** Write inside the caller's acceptance transaction. */
export async function write(
  ctx: MutationCtx,
  rows: Omit<CurrentProviderRow, 'first_scan_at'>[],
): Promise<void> {
  for (const row of rows) {
    const existing = await ctx.db
      .query(CURRENT_PROVIDERS_TABLE)
      .withIndex('by_provider_id', (q) => q.eq('provider_id', row.provider_id))
      .unique()

    const next: CurrentProviderRow = {
      ...row,
      first_scan_at: existing === null ? row.scan_at : existing.first_scan_at,
    }

    await (existing === null
      ? ctx.db.insert(CURRENT_PROVIDERS_TABLE, next)
      : ctx.db.replace(CURRENT_PROVIDERS_TABLE, existing._id, next))
  }
}

export function initialRows(scan: Scan) {
  return [...project(scan).values()].map(encodeProvider)
}

function project(scan: Scan) {
  return new Map(
    [...scan.providers].map(([id, provider]) => [id, projectProvider(provider, scan.scan_at)]),
  )
}

export const initialize = internalMutation({
  args: { rows: v.array(currentProvidersTable.validator.omit('first_scan_at')) },
  returns: v.null(),
  handler: async (ctx, { rows }) => {
    await assertInitialTableEmpty(ctx, CURRENT_PROVIDERS_TABLE)
    for (const row of rows) {
      await ctx.db.insert(CURRENT_PROVIDERS_TABLE, { ...row, first_scan_at: row.scan_at })
    }
    return null
  },
})

import { v } from 'convex/values'

import { internal } from '../../../_generated/api'
import { internalMutation } from '../../../_generated/server'
import type { ActionCtx } from '../../../_generated/server'
import { assertInitialTableEmpty } from '../../ingestion/initialization'
import { assertWorkOutput, completeWork, pendingWork, workId } from '../../ingestion/work'
import type { WorkId } from '../../ingestion/work'
import type { Endpoint } from '../../scan/entities'
import type { Scan, ScanPair } from '../../scan/extract'
import { pairTimes } from '../../scan/time'
import { V4_ENDPOINT_LISTINGS_TABLE, endpointListingsTable } from './table'
import type { EndpointListingRow } from './table'

/** Commit this work item's listing transitions and completion together. */
export const commit = internalMutation({
  args: { work_id: workId, ...pairTimes.fields, rows: v.array(endpointListingsTable.validator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    console.log('[v4:listings] commit', { work_id: args.work_id, inserts: args.rows.length })
    const work = await pendingWork(ctx, args.work_id, 'listings')

    if (work === null) {
      return null
    }

    assertWorkOutput(work, args, args.rows)
    for (const row of args.rows) {
      await ctx.db.insert(V4_ENDPOINT_LISTINGS_TABLE, row)
    }
    await completeWork(ctx, args.work_id)
    return null
  },
})

/** Use supplied observations for either a routine attempt or recovery; completion commits with output. */
export async function process(ctx: ActionCtx, pair: ScanPair, work_id: WorkId): Promise<void> {
  const rows = prepare(pair)
  console.log('[v4:listings] prepared', {
    work_id,
    inserts: rows.length,
    argumentLength: JSON.stringify(rows).length,
  })
  await ctx.runMutation(internal.v4.history.listings.ingest.commit, {
    work_id,
    from_scan_at: pair.previous.scan_at,
    scan_at: pair.next.scan_at,
    rows,
  })
}

function prepare({ previous, next }: ScanPair) {
  const rows: EndpointListingRow[] = []
  for (const endpoint of next.endpoints.values()) {
    const before = previous.endpoints.get(endpoint.id)

    if (
      before === undefined ||
      before.model_id !== endpoint.model_id ||
      before.provider_id !== endpoint.provider_id ||
      before.provider_tag !== endpoint.provider_tag
    ) {
      rows.push(listingRow(endpoint, next.scan_at, 'listed'))
    }
  }
  for (const endpoint of previous.endpoints.values()) {
    if (!next.endpoints.has(endpoint.id)) {
      rows.push(listingRow(endpoint, next.scan_at, 'unlisted'))
    }
  }
  return rows
}

/** Initial availability is seeded once, not inferred by the routine pair processor. */
export function initialRows(scan: Scan) {
  return [...scan.endpoints.values()].map((endpoint) =>
    listingRow(endpoint, scan.scan_at, 'listed'),
  )
}

export const initialize = internalMutation({
  args: { rows: v.array(endpointListingsTable.validator) },
  returns: v.null(),
  handler: async (ctx, { rows }) => {
    await assertInitialTableEmpty(ctx, V4_ENDPOINT_LISTINGS_TABLE)
    for (const row of rows) {
      await ctx.db.insert(V4_ENDPOINT_LISTINGS_TABLE, row)
    }
    return null
  },
})

function listingRow(
  endpoint: Endpoint,
  scan_at: string,
  state: EndpointListingRow['state'],
): EndpointListingRow {
  return {
    endpoint_id: endpoint.id,
    scan_at,
    model_id: endpoint.model_id,
    provider_id: endpoint.provider_id,
    provider_tag: endpoint.provider_tag,
    state,
  }
}

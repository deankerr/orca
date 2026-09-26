import { withoutSystemFields } from 'convex-helpers'
import { v } from 'convex/values'

import { internal } from '../../_generated/api'
import type { Id } from '../../_generated/dataModel'
import { internalMutation, query } from '../../_generated/server'
import type { ActionCtx } from '../../_generated/server'
import { cappedCutoff } from '../ingestion/clock'
import { V4_PROCESSOR_WORK_TABLE } from '../ingestion/table'
import { assertOutputScan, completeWork, pendingWork } from '../ingestion/work'
import type { Endpoint, Scan, ScanPair } from '../scan'
import { pageArgs, pageResult, emptyPage } from './pagination'
import { V4_ENDPOINT_LISTINGS_TABLE, endpointListingsTable } from './table'
import type { EndpointListingRow } from './table'

/** Page an endpoint's full context, including moves between models and provider tags. */
export const list = query({
  args: {
    endpoint_id: v.string(),
    ...pageArgs,
  },
  returns: pageResult(endpointListingsTable.validator),
  handler: async (ctx, args) => {
    const cutoff = await cappedCutoff(ctx, args.cutoff)

    if (cutoff === null) {
      return emptyPage()
    }

    const result = await ctx.db
      .query(V4_ENDPOINT_LISTINGS_TABLE)
      .withIndex('by_endpoint_id_and_scan_at', (q) =>
        q.eq('endpoint_id', args.endpoint_id).lte('scan_at', cutoff),
      )
      .order('desc')
      .paginate(args.paginationOpts)
    return { ...result, page: result.page.map(withoutSystemFields), as_of: cutoff }
  },
})

/** Page a model's context rows for historical endpoint discovery; deduplicate UUIDs across pages. */
export const byModel = query({
  args: {
    model_id: v.string(),
    ...pageArgs,
  },
  returns: pageResult(endpointListingsTable.validator),
  handler: async (ctx, args) => {
    const cutoff = await cappedCutoff(ctx, args.cutoff)

    if (cutoff === null) {
      return emptyPage()
    }

    const result = await ctx.db
      .query(V4_ENDPOINT_LISTINGS_TABLE)
      .withIndex('by_model_id_and_scan_at', (q) =>
        q.eq('model_id', args.model_id).lte('scan_at', cutoff),
      )
      .order('desc')
      .paginate(args.paginationOpts)
    return { ...result, page: result.page.map(withoutSystemFields), as_of: cutoff }
  },
})

/** Commit this work item's listing transitions and completion together. */
export const commitStep = internalMutation({
  args: { work_id: v.id(V4_PROCESSOR_WORK_TABLE), rows: v.array(endpointListingsTable.validator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    console.log('[v4:listings] commit', { work_id: args.work_id, inserts: args.rows.length })
    const work = await pendingWork(ctx, args.work_id, 'listings')

    if (work === null) {
      return null
    }

    assertOutputScan(args.rows, work.scan_at)
    for (const row of args.rows) {
      await ctx.db.insert(V4_ENDPOINT_LISTINGS_TABLE, row)
    }
    await completeWork(ctx, args.work_id)
    return null
  },
})

export async function process(
  ctx: ActionCtx,
  pair: ScanPair,
  work_id: Id<typeof V4_PROCESSOR_WORK_TABLE>,
): Promise<void> {
  const rows = prepare(pair)

  console.log('[v4:listings] prepared', {
    work_id,
    inserts: rows.length,
    argumentLength: JSON.stringify(rows).length,
  })

  await ctx.runMutation(internal.v4.history.listings.commitStep, { work_id, rows })
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

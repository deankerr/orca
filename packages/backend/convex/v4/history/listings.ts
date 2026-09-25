import { withoutSystemFields } from 'convex-helpers'
import { v } from 'convex/values'

import { internal } from '../../_generated/api'
import { internalMutation, query } from '../../_generated/server'
import type { ActionCtx } from '../../_generated/server'
import { cappedCutoff } from '../ingestion/clock'
import { advanceModuleCursor, logStep, stepArgs } from '../ingestion/step'
import type { ModuleStep, ObservationPair } from '../ingestion/step'
import type { Endpoint } from '../scan'
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
    const cutoff = await cappedCutoff(ctx, 'listings', args.cutoff)

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
    const cutoff = await cappedCutoff(ctx, 'listings', args.cutoff)

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

/** Processor transaction: commit listing transitions and the Listings cursor atomically. */
export const commitStep = internalMutation({
  args: { ...stepArgs, rows: v.array(endpointListingsTable.validator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    logStep(args, { inserts: args.rows.length })
    for (const row of args.rows) {
      await ctx.db.insert(V4_ENDPOINT_LISTINGS_TABLE, row)
    }
    return await advanceModuleCursor(ctx, args)
  },
})

export async function process(
  ctx: ActionCtx,
  pair: ObservationPair,
  step: ModuleStep,
): Promise<void> {
  const rows = prepare(pair)
  await ctx.runMutation(internal.v4.history.listings.commitStep, { ...step, rows })
}

function prepare({ previous, next }: ObservationPair) {
  const rows: EndpointListingRow[] = []
  for (const endpoint of next.endpoints.values()) {
    const before = previous?.endpoints.get(endpoint.id)

    if (
      before === undefined ||
      before.model_id !== endpoint.model_id ||
      before.provider_id !== endpoint.provider_id ||
      before.provider_tag !== endpoint.provider_tag
    ) {
      rows.push(listingRow(endpoint, next.scan_at, 'listed'))
    }
  }
  for (const endpoint of previous?.endpoints.values() ?? []) {
    if (!next.endpoints.has(endpoint.id)) {
      rows.push(listingRow(endpoint, next.scan_at, 'unlisted'))
    }
  }
  return rows
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

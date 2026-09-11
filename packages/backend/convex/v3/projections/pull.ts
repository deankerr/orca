import { ConvexHttpClient } from 'convex/browser'
import type { FunctionReference, PaginationOptions, PaginationResult } from 'convex/server'
import { ConvexError, v } from 'convex/values'
import type { Value } from 'convex/values'

import { api, internal } from '../../_generated/api'
import { env, internalAction, internalMutation } from '../../_generated/server'
import { store } from '../../objects'
import { getCurrentScan } from '../ingestions'
import { scanIngestionsTable, V3_SCAN_INGESTIONS_TABLE } from '../ingestions.table'
import { endpointsStatsTable, V3_ENDPOINTS_STATS_SERIES_TABLE } from '../series.table'

const PAGE_NUM_ITEMS = 250

/** Pull product projections from a deployment with the same queries/schema. Rerun to refresh. */
export const run = internalAction({
  args: { sourceUrl: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { sourceUrl }) => {
    const url = sourceUrl ?? env.ORCA_PULL_SOURCE_URL

    if (url === undefined || url === '') {
      console.log('pull skipped: no source URL configured')
      return null
    }

    const source = new ConvexHttpClient(url)
    const scan = await source.query(api.v3.projections.queries.currentScan, {})

    if (scan === null) {
      console.log('pull skipped: source has no current scan')
      return null
    }

    const identity = { path: 'scans', name: scan.to_artifact_id }
    const existing = await ctx.runQuery(internal.objects.locators.get, identity)

    if (existing === null) {
      const artifactUrl = new URL('/objects', url.replace('.convex.cloud', '.convex.site'))
      artifactUrl.search = new URLSearchParams(identity).toString()
      const response = await fetch(artifactUrl)

      if (!response.ok) {
        throw new ConvexError(`Artifact pull failed: ${response.status}`)
      }

      await store(ctx, { ...identity, text: await response.text() })
    }

    async function copy<Row extends Value>(
      query: FunctionReference<
        'query',
        'public',
        { paginationOpts: PaginationOptions },
        PaginationResult<Row>
      >,
      apply: FunctionReference<'mutation', 'internal', { rows: Row[] }, null>,
    ) {
      let cursor: string | null = null
      let count = 0
      while (true) {
        const result: PaginationResult<Row> = await source.query(query, {
          paginationOpts: { cursor, numItems: PAGE_NUM_ITEMS },
        })

        if (result.page.length > 0) {
          await ctx.runMutation(apply, { rows: result.page })
          count += result.page.length
        }

        if (result.isDone) {
          return count
        }

        cursor = result.continueCursor
      }
    }

    // Run without concurrent ingestion or another pull on this destination.
    console.log(
      'models',
      await copy(api.v3.projections.queries.models, internal.v3.projections.apply.models),
    )

    console.log(
      'providers',
      await copy(api.v3.projections.queries.providers, internal.v3.projections.apply.providers),
    )

    console.log(
      'endpoints',
      await copy(api.v3.projections.queries.endpoints, internal.v3.projections.apply.endpoints),
    )

    console.log(
      'endpointListings',
      await copy(
        api.v3.projections.queries.endpointListings,
        internal.v3.projections.apply.endpointListings,
      ),
    )

    console.log(
      'endpointsPricing',
      await copy(
        api.v3.projections.queries.endpointsPricing,
        internal.v3.projections.apply.endpointsPricing,
      ),
    )
    const rows = await source.query(api.v3.projections.queries.scanStats, { scan_at: scan.scan_at })
    await ctx.runMutation(internal.v3.projections.pull.currentScan, { scan, rows })
    console.log('current scan', { scan_at: scan.scan_at, readings: rows.length })
    return null
  },
})

/** Import scan stats and their ingestion record together, including scans without readings. */
export const currentScan = internalMutation({
  args: {
    scan: scanIngestionsTable.validator,
    rows: v.array(endpointsStatsTable.validator),
  },
  returns: v.null(),
  handler: async (ctx, { scan, rows }) => {
    if (rows.some((row) => row.scan_at !== scan.scan_at)) {
      throw new ConvexError('Pulled readings must belong to the captured scan')
    }

    const latest = await getCurrentScan(ctx)
    const existing = await ctx.db
      .query(V3_ENDPOINTS_STATS_SERIES_TABLE)
      .withIndex('by_scan_at', (q) => q.eq('scan_at', scan.scan_at))
      .collect()
    const keys = new Set(existing.map((row) => JSON.stringify([row.endpoint_id, row.tier])))

    for (const row of rows) {
      const key = JSON.stringify([row.endpoint_id, row.tier])

      if (!keys.has(key)) {
        await ctx.db.insert(V3_ENDPOINTS_STATS_SERIES_TABLE, row)
        keys.add(key)
      }
    }

    if (latest?.to_artifact_id !== scan.to_artifact_id) {
      await ctx.db.insert(V3_SCAN_INGESTIONS_TABLE, scan)
    }

    return null
  },
})

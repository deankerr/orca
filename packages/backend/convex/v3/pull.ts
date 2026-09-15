import { ConvexHttpClient } from 'convex/browser'
import type { FunctionReference, PaginationOptions, PaginationResult } from 'convex/server'
import { ConvexError, v } from 'convex/values'
import type { Value } from 'convex/values'

import { api, internal } from '../_generated/api'
import { env, internalAction } from '../_generated/server'
import { store } from '../objects'

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
    const scan = await source.query(api.views.exports.currentScan, {})

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
    console.log('models', await copy(api.views.exports.models, internal.views.apply.models))

    console.log(
      'providers',
      await copy(api.views.exports.providers, internal.views.apply.providers),
    )

    console.log(
      'endpoints',
      await copy(api.views.exports.endpoints, internal.views.apply.endpoints),
    )

    console.log(
      'endpointListings',
      await copy(api.views.exports.endpointListings, internal.views.apply.endpointListings),
    )

    console.log(
      'endpointsPricing',
      await copy(api.views.exports.endpointsPricing, internal.views.apply.endpointsPricing),
    )
    const rows = await source.query(api.views.exports.scanStats, { scan_at: scan.scan_at })
    await ctx.runMutation(internal.views.apply.currentScan, { scan, rows })
    console.log('current scan', { scan_at: scan.scan_at, readings: rows.length })
    return null
  },
})

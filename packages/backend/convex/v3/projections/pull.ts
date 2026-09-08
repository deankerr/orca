import { ConvexHttpClient } from 'convex/browser'
import type { FunctionReference, PaginationOptions, PaginationResult } from 'convex/server'
import { v } from 'convex/values'
import type { Value } from 'convex/values'

import { api, internal } from '../../_generated/api'
import { env, internalAction } from '../../_generated/server'

const PAGE_NUM_ITEMS = 250

/** Pull product projections from a deployment with the same queries/schema. Restart to replay. */
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
    return null
  },
})

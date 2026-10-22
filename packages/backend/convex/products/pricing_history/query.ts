import { withoutSystemFields } from 'convex-helpers'
import { v } from 'convex/values'

import { query } from '#generated/server'
import type { QueryCtx } from '#generated/server'

import { OBSERVATIONS_TABLE, endpointObservation } from '../../catalog/tables/observations'
import { ENDPOINT_PRICES_TABLE, endpointPricesTable } from '../../catalog/tables/pricing'

// Complete model queries follow the measured capacity decision in docs/orca/pricing-history.md.
// Keep the clock independent so completing a scan does not reread unchanged histories.
export const observations = query({
  args: { model_id: v.string() },
  handler: async (ctx, { model_id }) => {
    const ids = await historicalEndpointIds(ctx, model_id)

    return await Promise.all(
      ids.map(async (id) => {
        // A move away from this model is indexed under the new model.
        const rows = await ctx.db
          .query(OBSERVATIONS_TABLE)
          .withIndex('by_entity_kind_and_entity_id_and_scan_at', (q) =>
            q.eq('entity_kind', 'endpoint').eq('entity_id', id),
          )
          .collect()

        return {
          id,
          observations: rows.flatMap((row) =>
            row.entity_kind === 'endpoint' ? [withoutSystemFields(row)] : [],
          ),
        }
      }),
    )
  },
  returns: v.array(v.object({ id: v.string(), observations: v.array(endpointObservation) })),
})

export const prices = query({
  args: { model_id: v.string() },
  handler: async (ctx, { model_id }) => {
    const ids = await historicalEndpointIds(ctx, model_id)

    return await Promise.all(
      ids.map(async (id) => {
        const rows = await ctx.db
          .query(ENDPOINT_PRICES_TABLE)
          .withIndex('by_endpoint_id_and_scan_at', (q) => q.eq('endpoint_id', id))
          .collect()

        return { id, prices: rows.map(withoutSystemFields) }
      }),
    )
  },
  returns: v.array(v.object({ id: v.string(), prices: v.array(endpointPricesTable.validator) })),
})

async function historicalEndpointIds(ctx: QueryCtx, modelId: string) {
  const rows = await ctx.db
    .query(OBSERVATIONS_TABLE)
    .withIndex('by_model_id_and_scan_at', (q) => q.eq('model_id', modelId))
    .collect()

  return [...new Set(rows.map((row) => row.entity_id))].toSorted()
}

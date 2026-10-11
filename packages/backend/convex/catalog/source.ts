import { ConvexError } from 'convex/values'

import type { QueryCtx } from '#generated/server'

import { ENDPOINT_LISTINGS_TABLE } from '../history/listings/table'
import { INGESTIONS_TABLE } from '../ingestion/table'
import type { omittedMetadataKeys } from './metadata'

/** Last retained scan with endpoint membership, including departures recorded under another identity. */
export async function lastEndpointScan(
  ctx: QueryCtx,
  kind: keyof typeof omittedMetadataKeys,
  entityId: string,
  horizon: string,
): Promise<string | null> {
  const listings = ctx.db.query(ENDPOINT_LISTINGS_TABLE)
  const rows =
    kind === 'model'
      ? listings.withIndex('by_model_id_and_scan_at', (q) =>
          q.eq('model_id', entityId).lte('scan_at', horizon),
        )
      : kind === 'provider'
        ? listings.withIndex('by_provider_id_and_scan_at', (q) =>
            q.eq('provider_id', entityId).lte('scan_at', horizon),
          )
        : listings.withIndex('by_endpoint_id_and_scan_at', (q) =>
            q.eq('endpoint_id', entityId).lte('scan_at', horizon),
          )

  const seen = new Set<string>()
  let closedAt: string | null = null

  for await (const row of rows.order('desc')) {
    if (seen.has(row.endpoint_id)) {
      continue
    }

    seen.add(row.endpoint_id)
    let end = row.scan_at

    if (row.state === 'listed') {
      const next = await ctx.db
        .query(ENDPOINT_LISTINGS_TABLE)
        .withIndex('by_endpoint_id_and_scan_at', (q) =>
          q.eq('endpoint_id', row.endpoint_id).gt('scan_at', row.scan_at).lte('scan_at', horizon),
        )
        .first()

      if (next === null) {
        return horizon
      }

      end = next.scan_at
    }

    if (closedAt === null || end > closedAt) {
      closedAt = end
    }
  }

  if (closedAt === null) {
    return null
  }

  const ingestion = await ctx.db
    .query(INGESTIONS_TABLE)
    .withIndex('by_scan_at', (q) => q.eq('scan_at', closedAt))
    .unique()

  if (ingestion === null) {
    throw new ConvexError({
      message: 'Listing transition has no accepted scan pair',
      scan_at: closedAt,
    })
  }

  return ingestion.from_scan_at
}

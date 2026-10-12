import { ConvexError, v } from 'convex/values'
import type { Infer } from 'convex/values'

import { internal } from '#generated/api'
import type { ActionCtx } from '#generated/server'
import { internalMutation, internalQuery } from '#generated/server'
import * as scans from '#scanNew'

import { encodePricing } from '../../catalogNew/pricing'
import { CURRENT_ENDPOINTS_TABLE } from '../../catalogNew/tables/current'
import { OBSERVATIONS_TABLE } from '../../catalogNew/tables/observations'
import { compare } from '../../compare'
import type { JsonValue } from '../../json'
import schema from '../../schema'
import { currentEndpoint } from '../currentEndpoints'
import { assertReplacement, completedCutoff, currentFacts, locateSource, source } from './shared'
import type { RefreshResult } from './shared'

const entity = schema.doc(CURRENT_ENDPOINTS_TABLE)
const snapshot = v.object({ row: entity, as_of: v.string(), source })
type Snapshot = Infer<typeof snapshot>

export const read = internalQuery({
  args: { endpoint_id: v.string() },
  returns: snapshot,
  handler: async (ctx, { endpoint_id }) => {
    const row = await ctx.db
      .query(CURRENT_ENDPOINTS_TABLE)
      .withIndex('by_endpoint_id', (q) => q.eq('endpoint_id', endpoint_id))
      .unique()

    if (row === null) {
      throw new ConvexError('Catalog endpoint not found')
    }

    const as_of = await completedCutoff(ctx, row)

    const observation = await ctx.db
      .query(OBSERVATIONS_TABLE)
      .withIndex('by_entity_kind_and_entity_id_and_scan_at', (q) =>
        q.eq('entity_kind', 'endpoint').eq('entity_id', endpoint_id).lte('scan_at', as_of),
      )
      .order('desc')
      .first()

    if (observation?.entity_kind !== 'endpoint') {
      throw new ConvexError({
        message: 'Catalog endpoint has no observation at the completed cutoff',
        entity_kind: 'endpoint',
        entity_id: endpoint_id,
      })
    }

    return {
      row,
      as_of,
      source: await locateSource(ctx, observation.scan_at, observation.detected, as_of),
    }
  },
})

export async function refresh(ctx: ActionCtx, endpoint_id: string): Promise<RefreshResult> {
  const before: Snapshot = await ctx.runQuery(internal.ingestionNew.refresh.endpoints.read, {
    endpoint_id,
  })

  const scan = await scans.reader(ctx).loadScan(before.source.scan_at)
  const observed = scan.endpoints.get(endpoint_id)

  if (observed === undefined) {
    throw new ConvexError({
      message: 'Entity is absent from its selected source scan',
      entity_kind: 'endpoint',
      entity_id: endpoint_id,
      scan_at: scan.scan_at,
    })
  }

  const { metadata, pricing, ...fields } = currentEndpoint(observed.endpoint)

  const after = {
    ...fields,
    _id: before.row._id,
    _creationTime: before.row._creationTime,
    first_scan_at: before.row.first_scan_at,
    scan_at: scan.scan_at,
    ...(before.row.unlisted_at === undefined ? {} : { unlisted_at: before.row.unlisted_at }),
    pricing: encodePricing(pricing),
    metadata_json: JSON.stringify(metadata),
  }

  const changed: boolean = await ctx.runMutation(internal.ingestionNew.refresh.endpoints.replace, {
    before,
    after,
  })
  return { changed, source_scan_at: scan.scan_at, source_basis: before.source.basis }
}

export const replace = internalMutation({
  args: { before: snapshot, after: entity },
  returns: v.boolean(),
  handler: async (ctx, { before, after }) => {
    const row = await ctx.db.get(CURRENT_ENDPOINTS_TABLE, before.row._id)
    assertReplacement(row, before.row, after, before.as_of)

    if (after.endpoint_id !== before.row.endpoint_id) {
      throw new ConvexError('Replacement changes entity identity')
    }

    if (compare(endpointFacts(before.row), endpointFacts(after)).length === 0) {
      return false
    }

    const { _id, _creationTime: _created, ...fields } = after
    await ctx.db.replace(CURRENT_ENDPOINTS_TABLE, _id, fields)
    return true
  },
})

function endpointFacts(row: Infer<typeof entity>) {
  const { overrides_json, ...pricing } = row.pricing

  const overrides =
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Pricing overrides use trusted JSON storage encoding.
    overrides_json === undefined ? undefined : (JSON.parse(overrides_json) as JsonValue)
  return currentFacts({
    ...row,
    pricing: { ...pricing, ...(overrides === undefined ? {} : { overrides }) },
  })
}

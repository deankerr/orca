import { ConvexError, v } from 'convex/values'
import type { Infer } from 'convex/values'

import { internal } from '#generated/api'
import type { ActionCtx } from '#generated/server'
import { internalMutation, internalQuery } from '#generated/server'
import * as scans from '#scanNew'

import { CURRENT_PROVIDERS_TABLE } from '../../catalogNew/tables/current'
import { OBSERVATIONS_TABLE } from '../../catalogNew/tables/observations'
import { compare } from '../../compare'
import schema from '../../schema'
import { currentProvider } from '../currentProviders'
import { assertReplacement, completedCutoff, currentFacts, locateSource, source } from './shared'
import type { RefreshResult } from './shared'

const entity = schema.doc(CURRENT_PROVIDERS_TABLE)
const snapshot = v.object({ row: entity, as_of: v.string(), source })
type Snapshot = Infer<typeof snapshot>

export const read = internalQuery({
  args: { provider_id: v.string() },
  returns: snapshot,
  handler: async (ctx, { provider_id }) => {
    const row = await ctx.db
      .query(CURRENT_PROVIDERS_TABLE)
      .withIndex('by_provider_id', (q) => q.eq('provider_id', provider_id))
      .unique()

    if (row === null) {
      throw new ConvexError('Catalog provider not found')
    }

    const as_of = await completedCutoff(ctx, row)

    const observation = await ctx.db
      .query(OBSERVATIONS_TABLE)
      .withIndex('by_entity_kind_and_entity_id_and_scan_at', (q) =>
        q.eq('entity_kind', 'provider').eq('entity_id', provider_id).lte('scan_at', as_of),
      )
      .order('desc')
      .first()

    if (observation?.entity_kind !== 'provider') {
      throw new ConvexError({
        message: 'Catalog provider has no observation at the completed cutoff',
        entity_kind: 'provider',
        entity_id: provider_id,
      })
    }

    return {
      row,
      as_of,
      source: await locateSource(ctx, observation.scan_at, observation.endpoint_count > 0, as_of),
    }
  },
})

export async function refresh(ctx: ActionCtx, provider_id: string): Promise<RefreshResult> {
  const before: Snapshot = await ctx.runQuery(internal.ingestionNew.refresh.providers.read, {
    provider_id,
  })

  const scan = await scans.reader(ctx).loadScan(before.source.scan_at)
  const observed = scan.providers.get(provider_id)

  if (observed === undefined) {
    throw new ConvexError({
      message: 'Entity is absent from its selected source scan',
      entity_kind: 'provider',
      entity_id: provider_id,
      scan_at: scan.scan_at,
    })
  }

  const { metadata, ...fields } = currentProvider(observed)

  const after = {
    ...fields,
    _id: before.row._id,
    _creationTime: before.row._creationTime,
    first_scan_at: before.row.first_scan_at,
    scan_at: scan.scan_at,
    metadata_json: JSON.stringify(metadata),
  }

  const changed: boolean = await ctx.runMutation(internal.ingestionNew.refresh.providers.replace, {
    before,
    after,
  })
  return { changed, source_scan_at: scan.scan_at, source_basis: before.source.basis }
}

export const replace = internalMutation({
  args: { before: snapshot, after: entity },
  returns: v.boolean(),
  handler: async (ctx, { before, after }) => {
    const row = await ctx.db.get(CURRENT_PROVIDERS_TABLE, before.row._id)
    assertReplacement(row, before.row, after, before.as_of)

    if (after.provider_id !== before.row.provider_id) {
      throw new ConvexError('Replacement changes entity identity')
    }

    if (compare(currentFacts(before.row), currentFacts(after)).length === 0) {
      return false
    }

    const { _id, _creationTime: _created, ...fields } = after
    await ctx.db.replace(CURRENT_PROVIDERS_TABLE, _id, fields)
    return true
  },
})

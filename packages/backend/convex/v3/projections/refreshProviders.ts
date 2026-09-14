import type { PaginationResult } from 'convex/server'
import { ConvexError, v } from 'convex/values'

import { api, internal } from '../../_generated/api'
import { internalAction, internalMutation } from '../../_generated/server'
import { loadScanArtifact } from '../../scan/artifact'
import type { ProviderRow } from '../entities.table'
import { providersViewTable, V3_PROVIDERS_VIEW_TABLE } from '../entities.table'
import { createScanProjection } from './create'

/** Refresh every retained provider's metadata; run exclusively with ingestion and pulls stopped. */
export const run = internalAction({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const providers: ProviderRow[] = []
    let cursor: string | null = null
    do {
      const result: PaginationResult<ProviderRow> = await ctx.runQuery(
        api.v3.projections.queries.providers,
        { paginationOpts: { cursor, numItems: 250 } },
      )
      providers.push(...result.page)
      cursor = result.isDone ? null : result.continueCursor
    } while (cursor !== null)

    const artifactId = await ctx.runQuery(internal.v3.ingest.currentArtifactId, {})
    const current = createScanProjection(await loadScanArtifact(ctx, artifactId))
    const groups = new Map<string, string[]>()
    for (const provider of providers) {
      if (current.providers.has(provider.provider_id)) {
        continue
      }
      const group = groups.get(provider.scan_at) ?? []
      group.push(provider.provider_id)
      groups.set(provider.scan_at, group)
    }

    // Endpoint provider slugs can change, so the retained provider row identifies its source.
    for (const [scanAt, providerIds] of groups) {
      const sourceId = `scan.${scanAt}.jsonl`
      const projection = createScanProjection(await loadScanArtifact(ctx, sourceId))
      for (const providerId of providerIds) {
        const provider = projection.providers.get(providerId)
        if (provider === undefined) {
          throw new ConvexError(`Provider ${providerId} missing from source ${sourceId}`)
        }
        current.providers.set(providerId, provider)
      }
      console.log('provider refresh source', {
        artifactId: sourceId,
        providers: providerIds.length,
      })
    }

    const rows = providers.map((row) => {
      const projected = current.providers.get(row.provider_id)
      if (projected === undefined) {
        throw new ConvexError(`Provider has no resolved source: ${row.provider_id}`)
      }
      return { provider_id: row.provider_id, metadata: projected.metadata }
    })
    await ctx.runMutation(internal.v3.projections.refreshProviders.apply, { rows })
    console.log('provider refresh complete', { providers: rows.length })
    return rows.length
  },
})

/** Replace metadata atomically after every provider source has been resolved. */
export const apply = internalMutation({
  args: { rows: v.array(providersViewTable.validator.pick('provider_id', 'metadata')) },
  returns: v.null(),
  handler: async (ctx, { rows }) => {
    for (const row of rows) {
      const existing = await ctx.db
        .query(V3_PROVIDERS_VIEW_TABLE)
        .withIndex('by_provider_id', (q) => q.eq('provider_id', row.provider_id))
        .unique()
      if (existing === null) {
        throw new ConvexError(`Provider view missing during refresh: ${row.provider_id}`)
      }
      await ctx.db.patch(existing._id, { metadata: row.metadata })
    }
    return null
  },
})

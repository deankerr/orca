import type { PaginationResult } from 'convex/server'
import { ConvexError, v } from 'convex/values'

import { api, internal } from '../../_generated/api'
import { internalAction, internalMutation, internalQuery } from '../../_generated/server'
import { loadScanArtifact } from '../../scan/artifact'
import type { EndpointRow, ProviderRow } from '../entities.table'
import { providersViewTable, V3_PROVIDERS_VIEW_TABLE } from '../entities.table'
import { V3_SCAN_INGESTIONS_TABLE } from '../ingestions.table'
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
    const absent = new Set(
      providers
        .filter((row) => !current.providers.has(row.provider_id))
        .map((row) => row.provider_id),
    )
    const lastUnlisted = new Map<string, string>()

    if (absent.size > 0) {
      do {
        const result: PaginationResult<EndpointRow> = await ctx.runQuery(
          api.v3.projections.queries.endpoints,
          { paginationOpts: { cursor, numItems: 250 } },
        )
        for (const endpoint of result.page) {
          if (!absent.has(endpoint.provider_id)) {
            continue
          }
          if (endpoint.unlisted_at === undefined) {
            throw new ConvexError(`Absent provider has a listed endpoint: ${endpoint.provider_id}`)
          }
          const previous = lastUnlisted.get(endpoint.provider_id)
          if (previous === undefined || endpoint.unlisted_at > previous) {
            lastUnlisted.set(endpoint.provider_id, endpoint.unlisted_at)
          }
        }
        cursor = result.isDone ? null : result.continueCursor
      } while (cursor !== null)
    }

    const groups = new Map<string, string[]>()
    for (const providerId of absent) {
      const scanAt = lastUnlisted.get(providerId)
      if (scanAt === undefined) {
        throw new ConvexError(`Absent provider has no endpoint unlisting: ${providerId}`)
      }
      const group = groups.get(scanAt) ?? []
      group.push(providerId)
      groups.set(scanAt, group)
    }

    // The predecessor of the final unlisting is the provider's last observed source.
    for (const [scanAt, providerIds] of groups) {
      const sourceId: string = await ctx.runQuery(
        internal.v3.projections.refreshProviders.previousArtifactId,
        { scanAt },
      )
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

/** Resolve the actual ingested predecessor, rather than assuming scans are contiguous. */
export const previousArtifactId = internalQuery({
  args: { scanAt: v.string() },
  returns: v.string(),
  handler: async (ctx, { scanAt }) => {
    const ingestion = await ctx.db
      .query(V3_SCAN_INGESTIONS_TABLE)
      .withIndex('by_scan_at', (q) => q.eq('scan_at', scanAt))
      .unique()
    if (ingestion === null) {
      throw new ConvexError(`Missing ingestion for provider unlisting: ${scanAt}`)
    }
    return ingestion.from_artifact_id
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

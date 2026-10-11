import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'
import type { Infer } from 'convex/values'

import { internal } from '#generated/api'
import { internalAction, internalMutation, internalQuery } from '#generated/server'
import type { QueryCtx } from '#generated/server'
import * as scans from '#scan'
import { fromCollected } from '#scan/model'
import type { Scan } from '#scan/model'

import { clock } from '../clock'
import { normalizeEndpoint, normalizeModel, normalizeProvider } from '../entities'
import { CURRENT_ENDPOINTS_TABLE } from './endpoints/table'
import { currentMetadata } from './metadata'
import { CURRENT_MODELS_TABLE } from './models/table'
import { CURRENT_PROVIDERS_TABLE } from './providers/table'
import { lastEndpointScan } from './source'

const entityKind = v.union(v.literal('model'), v.literal('provider'), v.literal('endpoint'))
const target = v.object({ entity_kind: entityKind, entity_id: v.string() })
type Target = Infer<typeof target>
const snapshot = target.extend({
  as_of: v.string(),
  scan_at: v.string(),
  metadata_json: v.string(),
  unlisted_at: v.optional(v.string()),
})
type Snapshot = Infer<typeof snapshot>
const location = v.object({
  scan_at: v.string(),
  basis: v.union(v.literal('membership'), v.literal('catalog')),
})
type Location = Infer<typeof location>

/** Enumerate refresh targets without loading their source captures or coupling their progress. */
export const targets = internalQuery({
  args: { entity_kind: entityKind, paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(target),
  handler: async (ctx, { entity_kind, paginationOpts }) => {
    switch (entity_kind) {
      case 'model': {
        const result = await ctx.db
          .query(CURRENT_MODELS_TABLE)
          .withIndex('by_model_id')
          .paginate(paginationOpts)
        return {
          ...result,
          page: result.page.map((row) => ({ entity_kind, entity_id: row.model_id })),
        }
      }
      case 'provider': {
        const result = await ctx.db
          .query(CURRENT_PROVIDERS_TABLE)
          .withIndex('by_provider_id')
          .paginate(paginationOpts)
        return {
          ...result,
          page: result.page.map((row) => ({ entity_kind, entity_id: row.provider_id })),
        }
      }
      case 'endpoint': {
        const result = await ctx.db
          .query(CURRENT_ENDPOINTS_TABLE)
          .withIndex('by_endpoint_id')
          .paginate(paginationOpts)
        return {
          ...result,
          page: result.page.map((row) => ({ entity_kind, entity_id: row.endpoint_id })),
        }
      }
      default: {
        throw new ConvexError('Unknown entity kind')
      }
    }
  },
})

export const read = internalQuery({
  args: target.fields,
  returns: snapshot,
  handler: async (ctx, args) => {
    const row = await findEntity(ctx, args)
    const asOf = await clock(ctx)

    if (asOf === null) {
      throw new ConvexError('Catalog refresh requires an accepted scan')
    }

    return {
      ...args,
      as_of: asOf,
      scan_at: row.scan_at,
      metadata_json: row.metadata_json,
      ...('unlisted_at' in row && row.unlisted_at !== undefined
        ? { unlisted_at: row.unlisted_at }
        : {}),
    }
  },
})

/** Catalog can contain a more recent model observation than its last endpoint membership. */
export const historicalSource = internalQuery({
  args: snapshot.fields,
  returns: location,
  handler: async (ctx, args) => {
    const at = await lastEndpointScan(ctx, args.entity_kind, args.entity_id, args.as_of)

    return at !== null && at >= args.scan_at
      ? { scan_at: at, basis: 'membership' as const }
      : { scan_at: args.scan_at, basis: 'catalog' as const }
  },
})

const refreshResult = target.extend({
  source_scan_at: v.string(),
  source_basis: v.union(v.literal('latest'), v.literal('membership'), v.literal('catalog')),
  changed: v.boolean(),
})

/** Refresh only Catalog metadata; source reads and this write never produce Events or history rows. */
export const run = internalAction({
  args: target.fields,
  returns: refreshResult,
  handler: async (ctx, args): Promise<Infer<typeof refreshResult>> => {
    const before: Snapshot = await ctx.runQuery(internal.catalog.refresh.read, args)
    const reader = scans.reader(ctx)
    let source = fromCollected(await reader.loadCollected(before.as_of))
    let metadata = metadataFromScan(source, args)
    let basis: 'latest' | Location['basis'] = 'latest'

    if (metadata === null) {
      const historical: Location = await ctx.runQuery(
        internal.catalog.refresh.historicalSource,
        before,
      )
      source = fromCollected(await reader.loadCollected(historical.scan_at))
      metadata = metadataFromScan(source, args)
      ;({ basis } = historical)
    }

    if (metadata === null) {
      throw new ConvexError({
        message: 'Entity is absent from its selected source scan',
        ...args,
        scan_at: source.scan_at,
      })
    }

    const changed: boolean = await ctx.runMutation(internal.catalog.refresh.apply, {
      before,
      metadata_json: metadata,
      source_scan_at: source.scan_at,
    })

    return { ...args, changed, source_scan_at: source.scan_at, source_basis: basis }
  },
})

/** Keep entity identity, first observation, explicit properties, and availability intact. */
export const apply = internalMutation({
  args: { before: snapshot, metadata_json: v.string(), source_scan_at: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { before, metadata_json, source_scan_at }) => {
    const row = await findEntity(ctx, before)
    const unlistedAt = 'unlisted_at' in row ? row.unlisted_at : undefined

    if (
      row.scan_at !== before.scan_at ||
      row.metadata_json !== before.metadata_json ||
      unlistedAt !== before.unlisted_at
    ) {
      throw new ConvexError('Entity changed during metadata refresh; retry the entity')
    }

    if (source_scan_at < row.scan_at || source_scan_at > before.as_of) {
      throw new ConvexError('Metadata source is outside the refresh observation range')
    }

    if (row.metadata_json === metadata_json) {
      return false
    }

    await ctx.db.patch(row._id, { metadata_json, scan_at: source_scan_at })
    return true
  },
})

async function findEntity(ctx: QueryCtx, { entity_kind, entity_id }: Target) {
  const row =
    entity_kind === 'model'
      ? await ctx.db
          .query(CURRENT_MODELS_TABLE)
          .withIndex('by_model_id', (q) => q.eq('model_id', entity_id))
          .unique()
      : entity_kind === 'provider'
        ? await ctx.db
            .query(CURRENT_PROVIDERS_TABLE)
            .withIndex('by_provider_id', (q) => q.eq('provider_id', entity_id))
            .unique()
        : await ctx.db
            .query(CURRENT_ENDPOINTS_TABLE)
            .withIndex('by_endpoint_id', (q) => q.eq('endpoint_id', entity_id))
            .unique()

  if (row === null) {
    throw new ConvexError({ message: 'Catalog entity not found', entity_kind, entity_id })
  }

  return row
}

/** Normalize from Scan again so removing an omission can restore a field missing from Catalog. */
export function metadataFromScan(scan: Scan, { entity_kind, entity_id }: Target): string | null {
  switch (entity_kind) {
    case 'model': {
      const entity = scan.models.get(entity_id)
      return entity === undefined
        ? null
        : JSON.stringify(currentMetadata('model', normalizeModel(entity).metadata))
    }
    case 'provider': {
      const entity = scan.providers.get(entity_id)
      return entity === undefined
        ? null
        : JSON.stringify(currentMetadata('provider', normalizeProvider(entity).metadata))
    }
    case 'endpoint': {
      const entity = scan.endpoints.get(entity_id)
      return entity === undefined
        ? null
        : JSON.stringify(currentMetadata('endpoint', normalizeEndpoint(entity).metadata))
    }
    default: {
      throw new ConvexError('Unknown entity kind')
    }
  }
}

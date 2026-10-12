import { docValidator, paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'
import type { Infer } from 'convex/values'

import { internal } from '#generated/api'
import { internalAction, internalMutation, internalQuery } from '#generated/server'
import type { QueryCtx } from '#generated/server'
import * as scans from '#scanNew'
import type { Scan } from '#scanNew/model'

import { encodePricing } from '../catalogNew/pricing'
import {
  CURRENT_MODELS_TABLE,
  CURRENT_PROVIDERS_TABLE,
  CURRENT_ENDPOINTS_TABLE,
  currentModelsTable,
  currentProvidersTable,
  currentEndpointsTable,
} from '../catalogNew/tables/current'
import { compare } from '../compare'
import type { JsonValue } from '../json'
import { currentEndpoint } from './currentEndpoints'
import { currentModel } from './currentModels'
import { currentProvider } from './currentProviders'
import { lastEndpointScan } from './source'
import { INGESTIONS_TABLE } from './table'

const entityKind = v.union(v.literal('model'), v.literal('provider'), v.literal('endpoint'))
const target = v.object({ entity_kind: entityKind, entity_id: v.string() })
type Target = Infer<typeof target>
const entity = v.union(
  docValidator(CURRENT_MODELS_TABLE, currentModelsTable),
  docValidator(CURRENT_PROVIDERS_TABLE, currentProvidersTable),
  docValidator(CURRENT_ENDPOINTS_TABLE, currentEndpointsTable),
)
type Entity = Infer<typeof entity>
const snapshot = target.extend({ as_of: v.string(), row: entity })
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
    const complete = await ctx.db
      .query(INGESTIONS_TABLE)
      .withIndex('by_progress_kind_and_scan_at', (q) => q.eq('progress.kind', 'complete'))
      .order('desc')
      .first()

    if (complete === null) {
      throw new ConvexError('Current view refresh requires a completed input')
    }

    if (
      row.scan_at > complete.scan_at ||
      ('unlisted_at' in row && (row.unlisted_at ?? '') > complete.scan_at)
    ) {
      throw new ConvexError('Entity has pending ingestion changes; retry after input completion')
    }

    return { ...args, as_of: complete.scan_at, row }
  },
})

export const historicalSource = internalQuery({
  args: snapshot.fields,
  returns: location,
  handler: async (ctx, before) => {
    const at = await lastEndpointScan(ctx, before.entity_kind, before.entity_id, before.as_of)
    return at !== null && at >= before.row.scan_at
      ? { scan_at: at, basis: 'membership' as const }
      : { scan_at: before.row.scan_at, basis: 'catalog' as const }
  },
})

const refreshResult = target.extend({
  source_scan_at: v.string(),
  source_basis: v.union(v.literal('latest'), v.literal('membership'), v.literal('catalog')),
  changed: v.boolean(),
})

/** Reproject current facts without replaying ingestion, history, or Events. */
export const refreshCurrentEntity = internalAction({
  args: target.fields,
  returns: refreshResult,
  handler: async (ctx, args): Promise<Infer<typeof refreshResult>> => {
    const before: Snapshot = await ctx.runQuery(internal.ingestionNew.refresh.read, args)
    const reader = scans.reader(ctx)
    let scan = await reader.loadScan(before.as_of)
    let after = projectEntity(scan, before.row)
    let basis: 'latest' | Location['basis'] = 'latest'

    if (after === null) {
      const historical: Location = await ctx.runQuery(
        internal.ingestionNew.refresh.historicalSource,
        before,
      )
      scan = await reader.loadScan(historical.scan_at)
      after = projectEntity(scan, before.row)
      ;({ basis } = historical)
    }

    if (after === null) {
      throw new ConvexError({
        message: 'Entity is absent from its selected source scan',
        ...args,
        scan_at: scan.scan_at,
      })
    }

    const changed: boolean = await ctx.runMutation(
      internal.ingestionNew.refresh.replaceCurrentEntity,
      { before, after },
    )
    return { ...args, changed, source_scan_at: scan.scan_at, source_basis: basis }
  },
})

/** Compare the complete row so concurrent ingestion or another refresh cannot be overwritten. */
export const replaceCurrentEntity = internalMutation({
  args: { before: snapshot, after: entity },
  returns: v.boolean(),
  handler: async (ctx, { before, after }) => {
    const row = await findEntity(ctx, before)

    if (compare(row, before.row).length > 0) {
      throw new ConvexError('Entity changed during current view refresh; retry the entity')
    }

    if (after._id !== row._id || after.scan_at < row.scan_at || after.scan_at > before.as_of) {
      throw new ConvexError('Replacement is outside the refresh observation range or identity')
    }

    if (compare(currentFacts(row), currentFacts(after)).length === 0) {
      return false
    }

    const { _id, _creationTime: _created, ...fields } = after
    await ctx.db.replace(_id, fields)

    return true
  },
})

function currentFacts(row: Entity) {
  const { scan_at: _scanAt, metadata_json, ...fields } = row
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Current projections encode trusted JSON before storage.
  const metadata = JSON.parse(metadata_json) as JsonValue

  if ('pricing' in fields) {
    const { overrides_json, ...pricing } = fields.pricing
    const overrides: Record<string, JsonValue> =
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Pricing overrides use the same trusted JSON storage encoding.
      overrides_json === undefined ? {} : { overrides: JSON.parse(overrides_json) as JsonValue }
    return { ...fields, metadata, pricing: { ...pricing, ...overrides } }
  }

  return { ...fields, metadata }
}

async function findEntity(ctx: QueryCtx, { entity_kind, entity_id }: Target): Promise<Entity> {
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

function projectEntity(scan: Scan, before: Entity): Entity | null {
  const retained = {
    _creationTime: before._creationTime,
    first_scan_at: before.first_scan_at,
    scan_at: scan.scan_at,
  }

  if ('endpoint_id' in before) {
    const observed = scan.endpoints.get(before.endpoint_id)

    if (observed === undefined) {
      return null
    }

    const { metadata, pricing, ...fields } = currentEndpoint(observed.endpoint)
    return {
      ...fields,
      ...retained,
      _id: before._id,
      ...(before.unlisted_at === undefined ? {} : { unlisted_at: before.unlisted_at }),
      pricing: encodePricing(pricing),
      metadata_json: JSON.stringify(metadata),
    }
  }

  if ('model_id' in before) {
    const observed = scan.models.get(before.model_id)

    if (observed === undefined) {
      return null
    }

    const { metadata, ...fields } = currentModel(observed)
    return { ...fields, ...retained, _id: before._id, metadata_json: JSON.stringify(metadata) }
  }

  const observed = scan.providers.get(before.provider_id)

  if (observed === undefined) {
    return null
  }

  const { metadata, ...fields } = currentProvider(observed)
  return { ...fields, ...retained, _id: before._id, metadata_json: JSON.stringify(metadata) }
}

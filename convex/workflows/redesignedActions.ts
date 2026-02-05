/**
 * Redesigned Pipeline Actions
 *
 * Action implementations for the view-centric archive format.
 * These are thin wrappers that can be called from the workflow.
 */
import { v } from 'convex/values'
import { z } from 'zod'

import { gzipSync, gunzipSync } from 'fflate'
import prettyBytes from 'pretty-bytes'

import { db } from '../db'
import { internal } from '../_generated/api'
import { internalAction, internalMutation, type ActionCtx, type MutationCtx } from '../_generated/server'
import { getErrorMessage } from '../shared/utils'
import { EndpointTransformSchema } from '../snapshots/materialize/validators/endpoints'

import {
  type ViewArchiveBundle,
  type ModelViewData,
  type EndpointViewData,
  type ProviderViewData,
  type SourcesBundle,
  type ChangeRecord,
  compareArchives,
} from './redesignedPipeline'

// ============================================================================
// API FETCHING
// ============================================================================

const orFetch = async <T>(path: string, schema: z.ZodType<T>): Promise<T> => {
  const response = await fetch(`https://openrouter.ai${path}`)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }
  const json = await response.json()
  return schema.parse(json)
}

const ModelsListSchema = z
  .object({
    data: z.array(
      z.looseObject({
        slug: z.string(),
        permaslug: z.string(),
        author: z.string(),
        endpoint: z.looseObject({ variant: z.string() }).nullable(),
      }),
    ),
  })
  .transform((v) => v.data)

const EndpointsListSchema = z
  .object({ data: z.array(z.looseObject({ id: z.string() })) })
  .transform((v) => v.data)

const ProvidersListSchema = z
  .object({ data: z.array(z.record(z.string(), z.unknown())) })
  .transform((v) => v.data)

// ============================================================================
// CRAWL + TRANSFORM ACTION
// ============================================================================

/**
 * Crawl OpenRouter APIs and immediately transform to view format
 *
 * This combines fetching and transformation into a single step.
 * The output is a ViewArchiveBundle ready to be stored and compared.
 */
export const crawlAndTransform = internalAction({
  args: {},
  handler: async (ctx): Promise<{
    crawl_id: string
    totals: { models: number; endpoints: number; providers: number }
  }> => {
    const crawl_id = Date.now().toString()
    console.log('[redesigned:crawl] starting', { crawl_id })

    // Initialize bundle
    const bundle: ViewArchiveBundle = {
      crawl_id,
      version: 2,
      models: [],
      endpoints: [],
      providers: [],
      sources: { models: [], endpoints: [], providers: [] },
      meta: {
        fetched_at: Date.now(),
        totals: { models: 0, endpoints: 0, providers: 0 },
      },
    }

    // Track unique entities (endpoints reference models/providers, avoid duplicates)
    const modelsMap = new Map<string, ModelViewData>()
    const endpointsMap = new Map<string, EndpointViewData>()
    const providersMap = new Map<string, ProviderViewData>()

    // Fetch providers first
    try {
      const rawProviders = await orFetch('/api/frontend/all-providers', ProvidersListSchema)
      for (const rawProvider of rawProviders) {
        const slug = rawProvider.slug as string
        if (slug) {
          bundle.sources!.providers.push({ key: slug, data: rawProvider })
        }
      }
      console.log('[redesigned:crawl] providers fetched', { count: rawProviders.length })
    } catch (err) {
      console.error('[redesigned:crawl:providers] error', { error: getErrorMessage(err) })
    }

    // Fetch models list
    const modelsList = await orFetch('/api/frontend/models', ModelsListSchema)
    console.log('[redesigned:crawl] models list fetched', { count: modelsList.length })

    // Fetch endpoints for each model and transform immediately
    const issues: string[] = []

    for (const modelInfo of modelsList) {
      if (!modelInfo.endpoint) continue

      try {
        const rawEndpoints = await orFetch(
          `/api/frontend/stats/endpoint?permaslug=${modelInfo.permaslug}&variant=${modelInfo.endpoint.variant}`,
          EndpointsListSchema,
        )

        // Transform each endpoint using existing validator
        for (const rawEndpoint of rawEndpoints) {
          const parsed = EndpointTransformSchema.safeParse(rawEndpoint)

          if (!parsed.success) {
            issues.push(z.prettifyError(parsed.error))
            continue
          }

          const { model, endpoint, provider } = parsed.data

          // Store transformed entities
          modelsMap.set(model.slug, model)
          endpointsMap.set(endpoint.uuid, endpoint)
          providersMap.set(provider.slug, provider)

          // Store raw sources
          bundle.sources!.models.push({ key: model.slug, data: (rawEndpoint as any).model ?? {} })
          bundle.sources!.endpoints.push({ key: endpoint.uuid, data: rawEndpoint as Record<string, unknown> })
        }
      } catch (err) {
        console.error('[redesigned:crawl:endpoints] error', {
          model: modelInfo.slug,
          error: getErrorMessage(err),
        })
      }
    }

    if (issues.length > 0) {
      console.warn('[redesigned:crawl] transform issues', { count: issues.length })
    }

    // Populate bundle with deduplicated entities
    bundle.models = Array.from(modelsMap.values())
    bundle.endpoints = Array.from(endpointsMap.values())
    bundle.providers = Array.from(providersMap.values())
    bundle.meta.totals = {
      models: bundle.models.length,
      endpoints: bundle.endpoints.length,
      providers: bundle.providers.length,
    }

    console.log('[redesigned:crawl] transform complete', { totals: bundle.meta.totals })

    // Store the bundle
    await storeViewArchive(ctx, bundle)

    return {
      crawl_id,
      totals: bundle.meta.totals,
    }
  },
})

// ============================================================================
// ARCHIVE STORAGE
// ============================================================================

async function storeViewArchive(ctx: ActionCtx, bundle: ViewArchiveBundle) {
  // Serialize and compress
  const jsonString = JSON.stringify(bundle)
  const encoded = new TextEncoder().encode(jsonString)
  const compressed = gzipSync(encoded)

  const blob = new Blob([new Uint8Array(compressed)])
  const storage_id = await ctx.storage.store(blob)

  const size = {
    raw: encoded.byteLength,
    compressed: blob.size,
    ratio: Math.round((blob.size / encoded.byteLength) * 1000) / 1000,
  }

  // Store metadata
  await ctx.runMutation(internal.workflows.redesignedActions.insertArchiveMetadata, {
    crawl_id: bundle.crawl_id,
    storage_id,
    version: bundle.version,
    totals: bundle.meta.totals,
    size,
  })

  console.log('[redesigned:store]', {
    crawl_id: bundle.crawl_id,
    totals: bundle.meta.totals,
    size: {
      raw: prettyBytes(size.raw),
      compressed: prettyBytes(size.compressed),
      ratio: size.ratio,
    },
  })
}

export const insertArchiveMetadata = internalMutation({
  args: {
    crawl_id: v.string(),
    storage_id: v.id('_storage'),
    version: v.number(),
    totals: v.object({
      models: v.number(),
      endpoints: v.number(),
      providers: v.number(),
    }),
    size: v.object({
      raw: v.number(),
      compressed: v.number(),
      ratio: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    // Store in same table as old archives, but with version field
    await ctx.db.insert('snapshot_crawl_archives', {
      crawl_id: args.crawl_id,
      storage_id: args.storage_id,
      data: {
        totals: {
          ...args.totals,
          uptimes: 0,
          topApps: 0,
          analytics: 0,
        },
        size: {
          raw: args.size.raw,
          blob: args.size.compressed,
        },
      },
    })
  },
})

// ============================================================================
// ARCHIVE RETRIEVAL
// ============================================================================

export async function getViewArchive(ctx: ActionCtx, crawl_id: string): Promise<ViewArchiveBundle | null> {
  const metadata = await ctx.runQuery(internal.workflows.redesignedActions.getArchiveMetadata, { crawl_id })
  if (!metadata) return null

  const blob = await ctx.storage.get(metadata.storage_id)
  if (!blob) return null

  const arrayBuffer = await blob.arrayBuffer()
  const decompressed = gunzipSync(new Uint8Array(arrayBuffer))
  const jsonString = new TextDecoder().decode(decompressed)
  const bundle = JSON.parse(jsonString) as ViewArchiveBundle

  return bundle
}

export async function getLatestViewArchive(ctx: ActionCtx): Promise<ViewArchiveBundle | null> {
  const metadata = await ctx.runQuery(internal.workflows.redesignedActions.getLatestArchiveMetadata, {})
  if (!metadata) return null

  return getViewArchive(ctx, metadata.crawl_id)
}

export async function getPreviousViewArchive(ctx: ActionCtx, beforeCrawlId: string): Promise<ViewArchiveBundle | null> {
  const metadata = await ctx.runQuery(internal.workflows.redesignedActions.getPreviousArchiveMetadata, {
    before_crawl_id: beforeCrawlId,
  })
  if (!metadata) return null

  return getViewArchive(ctx, metadata.crawl_id)
}

import { query } from '../_generated/server'

export const getArchiveMetadata = query({
  args: { crawl_id: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('snapshot_crawl_archives')
      .withIndex('by_crawl_id', (q) => q.eq('crawl_id', args.crawl_id))
      .first()
  },
})

export const getLatestArchiveMetadata = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query('snapshot_crawl_archives')
      .withIndex('by_crawl_id')
      .order('desc')
      .first()
  },
})

export const getPreviousArchiveMetadata = query({
  args: { before_crawl_id: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('snapshot_crawl_archives')
      .withIndex('by_crawl_id', (q) => q.lt('crawl_id', args.before_crawl_id))
      .order('desc')
      .first()
  },
})

// ============================================================================
// MATERIALIZE + CHANGES ACTION
// ============================================================================

/**
 * Combined Materialize and Change Detection
 *
 * This is the key innovation - instead of:
 * 1. Load current DB state
 * 2. Compare with new data
 * 3. Upsert views
 * 4. (Later) Load two archives
 * 5. (Later) Compare for changes
 *
 * We do:
 * 1. Load previous archive (view format)
 * 2. Load current archive (view format)
 * 3. Compare → produces changes
 * 4. Upsert views + insert changes atomically
 */
export const materializeWithChanges = internalAction({
  args: { crawl_id: v.string() },
  handler: async (ctx, args): Promise<{
    models: { stable: number; updated: number; inserted: number; unavailable: number }
    endpoints: { stable: number; updated: number; inserted: number; unavailable: number }
    providers: { stable: number; updated: number; inserted: number; unavailable: number }
    changes: { total: number; creates: number; updates: number; deletes: number }
  }> => {
    console.log('[redesigned:materialize] starting', { crawl_id: args.crawl_id })

    // Load current archive
    const current = await getViewArchive(ctx, args.crawl_id)
    if (!current) {
      throw new Error(`Archive not found: ${args.crawl_id}`)
    }

    // Load previous archive (for change detection)
    const previous = await getPreviousViewArchive(ctx, args.crawl_id)

    console.log('[redesigned:materialize] archives loaded', {
      current_crawl_id: current.crawl_id,
      previous_crawl_id: previous?.crawl_id ?? null,
    })

    // Compute changes between archives
    const changes: ChangeRecord[] = previous
      ? compareArchives({ previous, current })
      : []

    console.log('[redesigned:materialize] changes computed', {
      total: changes.length,
      creates: changes.filter((c) => c.change_kind === 'create').length,
      updates: changes.filter((c) => c.change_kind === 'update').length,
      deletes: changes.filter((c) => c.change_kind === 'delete').length,
    })

    // Perform upsert with changes in a single mutation
    const result = await ctx.runMutation(internal.workflows.redesignedActions.upsertWithChanges, {
      crawl_id: args.crawl_id,
      models: current.models,
      endpoints: current.endpoints,
      providers: current.providers,
      changes,
    })

    console.log('[redesigned:materialize] complete', result)

    return result
  },
})

// ============================================================================
// UPSERT MUTATION
// ============================================================================

/**
 * Atomic upsert of views and changes
 *
 * This mutation:
 * 1. Upserts all models, endpoints, providers
 * 2. Marks missing entities as unavailable
 * 3. Inserts all change records
 *
 * All in a single transaction.
 */
export const upsertWithChanges = internalMutation({
  args: {
    crawl_id: v.string(),
    models: v.array(v.any()),
    endpoints: v.array(v.any()),
    providers: v.array(v.any()),
    changes: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    const crawl_id_num = parseInt(args.crawl_id)

    // Run upserts in parallel
    const [modelResult, endpointResult, providerResult] = await Promise.all([
      upsertEntities(ctx, 'models', args.models as ModelViewData[], (m) => m.slug),
      upsertEntities(ctx, 'endpoints', args.endpoints as EndpointViewData[], (e) => e.uuid),
      upsertEntities(ctx, 'providers', args.providers as ProviderViewData[], (p) => p.slug),
    ])

    // Insert changes
    for (const change of args.changes as ChangeRecord[]) {
      await ctx.db.insert('or_views_changes', change as any)
    }

    return {
      models: modelResult,
      endpoints: endpointResult,
      providers: providerResult,
      changes: {
        total: args.changes.length,
        creates: (args.changes as ChangeRecord[]).filter((c) => c.change_kind === 'create').length,
        updates: (args.changes as ChangeRecord[]).filter((c) => c.change_kind === 'update').length,
        deletes: (args.changes as ChangeRecord[]).filter((c) => c.change_kind === 'delete').length,
      },
    }

    async function upsertEntities<T extends Record<string, unknown>>(
      ctx: MutationCtx,
      entityType: 'models' | 'endpoints' | 'providers',
      items: T[],
      getKey: (item: T) => string,
    ) {
      const counters = { stable: 0, updated: 0, inserted: 0, unavailable: 0 }

      // Get current DB state
      const tableName = `or_views_${entityType}` as const
      const indexName = entityType === 'endpoints' ? 'by_uuid' : 'by_slug'

      const currentDocs = await ctx.db.query(tableName).collect()
      const currentMap = new Map(
        currentDocs.map((doc) => {
          const key = entityType === 'endpoints' ? (doc as any).uuid : (doc as any).slug
          return [key, doc] as const
        }),
      )

      const processedKeys = new Set<string>()

      for (const item of items) {
        const key = getKey(item)
        processedKeys.add(key)

        const existing = currentMap.get(key)

        if (existing) {
          // Check if changed (simple deep comparison)
          const hasChanges = JSON.stringify(stripFields(existing)) !== JSON.stringify(item)

          if (hasChanges) {
            await ctx.db.replace(existing._id, { ...item, updated_at: Date.now() } as any)
            counters.updated++
          } else {
            counters.stable++
          }
        } else {
          await ctx.db.insert(tableName, { ...item, updated_at: Date.now() } as any)
          counters.inserted++
        }
      }

      // Mark missing as unavailable
      for (const [key, doc] of currentMap) {
        if (!processedKeys.has(key) && !(doc as any).unavailable_at) {
          await ctx.db.patch(doc._id, { unavailable_at: crawl_id_num })
          counters.unavailable++
        }
      }

      return counters
    }

    function stripFields(doc: any): Record<string, unknown> {
      const { _id, _creationTime, updated_at, unavailable_at, ...rest } = doc
      return rest
    }
  },
})

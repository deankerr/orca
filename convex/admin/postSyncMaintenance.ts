import { v } from 'convex/values'
import * as R from 'remeda'

import { db } from '@/convex/db'

import { internal } from '../_generated/api'
import { internalAction, internalMutation, internalQuery } from '../_generated/server'
import { materializeModelEndpoints } from '../snapshots/materialize/main'
import { getArchiveBundle } from '../snapshots/shared/bundle'

type EntityType = 'model' | 'endpoint' | 'provider'

type DeletionRef = {
  entity_type: EntityType
  key: string // model_slug, endpoint_uuid, or provider_slug
  crawl_id: string
  previous_crawl_id: string
}

// * Main orchestrator
export const run = internalAction({
  handler: async (ctx) => {
    // * get all delete changes
    const deletions = await ctx.runQuery(internal.admin.postSyncMaintenance.getDeletions)
    console.log('[postSyncMaintenance]', { totalDeletions: deletions.length })

    if (deletions.length === 0) {
      console.log('[postSyncMaintenance] no deletions to process')
      return
    }

    // * partition into missing vs existing entities
    const { missing, existing } = await ctx.runMutation(
      internal.admin.postSyncMaintenance.partitionDeletions,
      { deletions },
    )

    console.log('[postSyncMaintenance]', {
      missing: missing.length,
      existing: existing.length,
    })

    // * restore missing entities (grouped by previous_crawl_id)
    if (missing.length > 0) {
      const byBundle = R.groupBy(missing, (m) => m.previous_crawl_id)

      for (const [previous_crawl_id, toRestore] of Object.entries(byBundle)) {
        const bundle = await getArchiveBundle(ctx, previous_crawl_id)

        if (!bundle) {
          console.warn('[postSyncMaintenance] missing bundle', { previous_crawl_id })
          continue
        }

        const materialized = materializeModelEndpoints(bundle)

        await ctx.runMutation(internal.admin.postSyncMaintenance.restoreEntities, {
          toRestore,
          models: materialized.models,
          endpoints: materialized.endpoints,
          providers: materialized.providers,
        })
      }
    }

    // * update unavailable_at on existing entities
    if (existing.length > 0) {
      await ctx.runMutation(internal.admin.postSyncMaintenance.setUnavailableAt, {
        existing,
      })
    }

    console.log('[postSyncMaintenance] complete')
  },
})

// * Get all delete changes
export const getDeletions = internalQuery({
  handler: async (ctx): Promise<DeletionRef[]> => {
    const deletionChanges = await ctx.db
      .query('or_views_changes')
      .withIndex('by_change_kind', (q) => q.eq('change_kind', 'delete'))
      .collect()

    return deletionChanges.map((change) => {
      if (change.entity_type === 'model') {
        return {
          entity_type: 'model' as const,
          key: change.model_slug,
          crawl_id: change.crawl_id,
          previous_crawl_id: change.previous_crawl_id,
        }
      } else if (change.entity_type === 'endpoint') {
        return {
          entity_type: 'endpoint' as const,
          key: change.endpoint_uuid,
          crawl_id: change.crawl_id,
          previous_crawl_id: change.previous_crawl_id,
        }
      } else {
        return {
          entity_type: 'provider' as const,
          key: change.provider_slug,
          crawl_id: change.crawl_id,
          previous_crawl_id: change.previous_crawl_id,
        }
      }
    })
  },
})

const vDeletionRef = v.object({
  entity_type: v.union(v.literal('model'), v.literal('endpoint'), v.literal('provider')),
  key: v.string(),
  crawl_id: v.string(),
  previous_crawl_id: v.string(),
})

// * Partition deletions into missing vs existing
export const partitionDeletions = internalMutation({
  args: {
    deletions: v.array(vDeletionRef),
  },
  handler: async (ctx, { deletions }) => {
    const missing: DeletionRef[] = []
    const existing: DeletionRef[] = []

    for (const deletion of deletions) {
      let exists = false

      if (deletion.entity_type === 'model') {
        const model = await ctx.db
          .query('or_views_models')
          .withIndex('by_slug', (q) => q.eq('slug', deletion.key))
          .first()
        exists = model !== null
      } else if (deletion.entity_type === 'endpoint') {
        const endpoint = await ctx.db
          .query('or_views_endpoints')
          .withIndex('by_uuid', (q) => q.eq('uuid', deletion.key))
          .first()
        exists = endpoint !== null
      } else if (deletion.entity_type === 'provider') {
        const provider = await ctx.db
          .query('or_views_providers')
          .withIndex('by_slug', (q) => q.eq('slug', deletion.key))
          .first()
        exists = provider !== null
      }

      if (exists) {
        existing.push(deletion)
      } else {
        missing.push(deletion)
      }
    }

    return { missing, existing }
  },
})

// * Restore missing entities from materialized bundle data
export const restoreEntities = internalMutation({
  args: {
    toRestore: v.array(vDeletionRef),
    models: v.array(db.or.views.models.vTable.validator.omit('updated_at')),
    endpoints: v.array(db.or.views.endpoints.vTable.validator.omit('updated_at')),
    providers: v.array(db.or.views.providers.vTable.validator.omit('updated_at')),
  },
  handler: async (ctx, { toRestore, models, endpoints, providers }) => {
    const counters = { models: 0, endpoints: 0, providers: 0 }

    // * build lookup maps
    const modelsMap = new Map(models.map((m) => [m.slug, m]))
    const endpointsMap = new Map(endpoints.map((e) => [e.uuid, e]))
    const providersMap = new Map(providers.map((p) => [p.slug, p]))

    for (const ref of toRestore) {
      const unavailable_at = Number(ref.crawl_id)

      if (ref.entity_type === 'model') {
        const model = modelsMap.get(ref.key)
        if (model) {
          await db.or.views.models.insert(ctx, { ...model, unavailable_at })
          counters.models++
        } else {
          console.warn('[postSyncMaintenance:restore] model not found in bundle', { key: ref.key })
        }
      } else if (ref.entity_type === 'endpoint') {
        const endpoint = endpointsMap.get(ref.key)
        if (endpoint) {
          await db.or.views.endpoints.insert(ctx, { ...endpoint, unavailable_at })
          counters.endpoints++
        } else {
          console.warn('[postSyncMaintenance:restore] endpoint not found in bundle', {
            key: ref.key,
          })
        }
      } else if (ref.entity_type === 'provider') {
        const provider = providersMap.get(ref.key)
        if (provider) {
          await db.or.views.providers.insert(ctx, { ...provider, unavailable_at })
          counters.providers++
        } else {
          console.warn('[postSyncMaintenance:restore] provider not found in bundle', {
            key: ref.key,
          })
        }
      }
    }

    console.log('[postSyncMaintenance:restore]', counters)
  },
})

// * Set unavailable_at on existing entities
export const setUnavailableAt = internalMutation({
  args: {
    existing: v.array(vDeletionRef),
  },
  handler: async (ctx, { existing }) => {
    const counters = { models: 0, endpoints: 0, providers: 0 }

    for (const ref of existing) {
      const unavailable_at = Number(ref.crawl_id)

      if (ref.entity_type === 'model') {
        const model = await ctx.db
          .query('or_views_models')
          .withIndex('by_slug', (q) => q.eq('slug', ref.key))
          .first()
        if (model && model.unavailable_at === undefined) {
          await db.or.views.models.patch(ctx, model._id, { unavailable_at })
          counters.models++
        }
      } else if (ref.entity_type === 'endpoint') {
        const endpoint = await ctx.db
          .query('or_views_endpoints')
          .withIndex('by_uuid', (q) => q.eq('uuid', ref.key))
          .first()
        if (endpoint && endpoint.unavailable_at === undefined) {
          await db.or.views.endpoints.patch(ctx, endpoint._id, { unavailable_at })
          counters.endpoints++
        }
      } else if (ref.entity_type === 'provider') {
        const provider = await ctx.db
          .query('or_views_providers')
          .withIndex('by_slug', (q) => q.eq('slug', ref.key))
          .first()
        if (provider && provider.unavailable_at === undefined) {
          await db.or.views.providers.patch(ctx, provider._id, { unavailable_at })
          counters.providers++
        }
      }
    }

    console.log('[postSyncMaintenance:setUnavailableAt]', counters)
  },
})

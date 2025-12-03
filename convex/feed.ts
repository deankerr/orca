import { stream } from 'convex-helpers/server/stream'
import { literals } from 'convex-helpers/validators'
import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import type { Doc } from './_generated/dataModel'
import { query } from './_generated/server'
import schema from './schema'
import { transformChanges } from './transforms/changes'

export type ChangeDoc = Doc<'or_views_changes'>

const GOAL_COUNT = 50
const MAX_CYCLES = 50

function sortChanges(changes: ChangeDoc[]): ChangeDoc[] {
  // * Separate into groups
  const modelDeletes: ChangeDoc[] = []
  const endpoints: ChangeDoc[] = []
  const modelUpdatesCreates: ChangeDoc[] = []

  for (const change of changes) {
    if (change.entity_type === 'model') {
      if (change.change_kind === 'delete') {
        modelDeletes.push(change)
      } else {
        modelUpdatesCreates.push(change)
      }
    } else if (change.entity_type === 'endpoint') {
      endpoints.push(change)
    }
  }

  // * Sort model deletes: by model_slug, then path
  modelDeletes.sort((a, b) => {
    if (a.entity_type !== 'model' || b.entity_type !== 'model') return 0
    const modelCompare = a.model_slug.localeCompare(b.model_slug)
    if (modelCompare !== 0) return modelCompare
    if (a.path && b.path) return a.path.localeCompare(b.path)
    return 0
  })

  // * Sort endpoints: by provider_tag_slug, then model_slug, then path
  endpoints.sort((a, b) => {
    if (a.entity_type !== 'endpoint' || b.entity_type !== 'endpoint') return 0
    const providerCompare = a.provider_tag_slug.localeCompare(b.provider_tag_slug)
    if (providerCompare !== 0) return providerCompare
    const modelCompare = a.model_slug.localeCompare(b.model_slug)
    if (modelCompare !== 0) return modelCompare
    if (a.path && b.path) return a.path.localeCompare(b.path)
    return 0
  })

  // * Sort model updates/creates: by model_slug, then path
  modelUpdatesCreates.sort((a, b) => {
    if (a.entity_type !== 'model' || b.entity_type !== 'model') return 0
    const modelCompare = a.model_slug.localeCompare(b.model_slug)
    if (modelCompare !== 0) return modelCompare
    if (a.path && b.path) return a.path.localeCompare(b.path)
    return 0
  })

  // * Concatenate in order: model deletes, endpoints, model updates/creates
  return [...modelDeletes, ...endpoints, ...modelUpdatesCreates]
}

export const changesByCrawlId = query({
  args: {
    entityType: v.optional(literals('model', 'endpoint')),
    modelSlug: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { entityType, modelSlug, paginationOpts }) => {
    const baseStream = stream(ctx.db, schema).query('or_views_changes')

    function byEntityType(entityType: 'model' | 'endpoint') {
      return baseStream
        .withIndex('by_entity_type__crawl_id', (q) =>
          q.eq('entity_type', entityType).lt('crawl_id', paginationOpts.cursor ?? 'a'),
        )
        .order('desc')
        .distinct(['crawl_id'])
    }

    function byModelSlug(modelSlug: string) {
      return baseStream
        .withIndex('by_model_slug__crawl_id', (q) =>
          q.eq('model_slug', modelSlug).lt('crawl_id', paginationOpts.cursor ?? 'a'),
        )
        .order('desc')
        .distinct(['crawl_id'])
    }

    function byEntityTypeAndModelSlug(entityType: 'model' | 'endpoint', modelSlug: string) {
      return baseStream
        .withIndex('by_entity_type__model_slug__crawl_id', (q) =>
          q
            .eq('entity_type', entityType)
            .eq('model_slug', modelSlug)
            .lt('crawl_id', paginationOpts.cursor ?? 'a'),
        )
        .order('desc')
        .distinct(['crawl_id'])
    }

    function all() {
      return baseStream
        .withIndex('by_crawl_id', (q) => q.lt('crawl_id', paginationOpts.cursor ?? 'a'))
        .order('desc')
        .distinct(['crawl_id'])
    }

    const crawlIdStream =
      entityType && modelSlug
        ? byEntityTypeAndModelSlug(entityType, modelSlug)
        : entityType
          ? byEntityType(entityType)
          : modelSlug
            ? byModelSlug(modelSlug)
            : all()

    // * Iterate through crawl_ids, fetch and flatten batches
    const results: ChangeDoc[] = []
    let continueCursor = ''
    let cycles = 0

    for await (const doc of crawlIdStream) {
      cycles++
      const crawl_id = doc.crawl_id

      // * Fetch all changes for this crawl_id (filtered by model if needed)
      const batch =
        entityType && modelSlug
          ? await ctx.db
              .query('or_views_changes')
              .withIndex('by_entity_type__model_slug__crawl_id', (q) =>
                q
                  .eq('entity_type', entityType)
                  .eq('model_slug', modelSlug)
                  .eq('crawl_id', crawl_id),
              )
              .collect()
          : entityType
            ? await ctx.db
                .query('or_views_changes')
                .withIndex('by_entity_type__crawl_id', (q) =>
                  q.eq('entity_type', entityType).eq('crawl_id', crawl_id),
                )
                .collect()
            : modelSlug
              ? await ctx.db
                  .query('or_views_changes')
                  .withIndex('by_model_slug__crawl_id', (q) =>
                    q.eq('model_slug', modelSlug).eq('crawl_id', crawl_id),
                  )
                  .collect()
              : await ctx.db
                  .query('or_views_changes')
                  .withIndex('by_crawl_id', (q) => q.eq('crawl_id', crawl_id))
                  .collect()

      const transformed = transformChanges(batch)
      const sorted = sortChanges(transformed)
      results.push(...sorted)

      continueCursor = crawl_id

      if (cycles >= MAX_CYCLES) break
      if (results.length >= GOAL_COUNT) break
    }

    return {
      page: results,
      continueCursor,
      isDone: continueCursor === '',
    }
  },
})

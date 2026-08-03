import { isRecord } from '../transform/json.ts'
import type { CleanBundle, CorpusCrawl } from './types.ts'

/**
 * Match `packages/backend/convex/snapshots/materialize/main.ts`:
 *
 * - The outer `scope.model` is traversal/fetch metadata and is NEVER a materialized model source.
 * - Models come exclusively from the `model` embedded in each successful endpoint record.
 * - A scope with no endpoints contributes no model.
 * - Repeated endpoint model copies are keyed with `Map.set(model.slug, model)`, so the last copy
 *   wins. We deliberately do not compare the copies or fall back to `scope.model`.
 *
 * Keep this rule here, before storage and product projection. Using outer models creates entities
 * and lifecycle events that the production materializer never produced.
 */
export const deduplicateModels = (bundle: CleanBundle): CorpusCrawl => {
  const models = new Map<string, Record<string, unknown>>()
  const endpoints = bundle.data.models.flatMap((scope) =>
    scope.endpoints.map((rawEndpoint) => {
      const { model, ...data } = rawEndpoint
      if (!isRecord(model) || typeof model.slug !== 'string') {
        throw new Error(`crawl ${bundle.crawl_id} contains an endpoint without a model slug`)
      }
      models.set(model.slug, model)
      return { data, modelSlug: model.slug }
    }),
  )
  return { crawlId: bundle.crawl_id, endpoints, models: [...models.values()] }
}

import type { WithoutSystemFields } from 'convex/server'
import { v } from 'convex/values'
import * as R from 'remeda'
import { z } from 'zod'

import { internal } from '../../_generated/api'
import type { Doc } from '../../_generated/dataModel'
import { internalAction } from '../../_generated/server'
import type { CrawlArchiveBundle } from '../crawl/main'
import { getArchiveBundleOrThrow } from '../shared/bundle'
import { EndpointTransformSchema } from './validators/endpoints'

type MaterializedModel = Omit<WithoutSystemFields<Doc<'or_views_models'>>, 'updated_at'>
type MaterializedEndpoint = Omit<WithoutSystemFields<Doc<'or_views_endpoints'>>, 'updated_at'>
type MaterializedProvider = Omit<WithoutSystemFields<Doc<'or_views_providers'>>, 'updated_at'>

export const run = internalAction({
  args: { crawl_id: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const bundle = await getArchiveBundleOrThrow(ctx, args.crawl_id)

    console.log(`[materialize]`, { crawl_id: bundle.crawl_id })

    const { models, endpoints, providers, sources, failedModelKeys } =
      materializeModelEndpoints(bundle)

    if (endpoints.length === 0) {
      console.warn(`[materialize] abort: no endpoints found`)
      return
    }

    await ctx.runMutation(internal.snapshots.materialize.output.upsert, {
      models,
      endpoints,
      providers,
      crawl_id: bundle.crawl_id,
      failedModelKeys: [...failedModelKeys],
    })

    await ctx.runMutation(internal.snapshots.materialize.output.upsertSources, {
      entityType: 'model',
      items: sources.models,
    })
    await ctx.runMutation(internal.snapshots.materialize.output.upsertSources, {
      entityType: 'endpoint',
      items: sources.endpoints,
    })
    await ctx.runMutation(internal.snapshots.materialize.output.upsertSources, {
      entityType: 'provider',
      items: sources.providers,
    })

    // * schedule materializeChanges
    await ctx.scheduler.runAfter(0, internal.snapshots.materializedChanges.main.run, {})
  },
})

export function materializeModelEndpoints(bundle: CrawlArchiveBundle) {
  // * collect failed model keys before filtering
  const failedModelKeys = new Set<string>()
  for (const m of bundle.data.models) {
    if (!Array.isArray(m.endpoints)) {
      failedModelKeys.add(`${m.model.permaslug}:${m.model.endpoint?.variant}`)
    }
  }
  if (failedModelKeys.size > 0) {
    console.warn('[materialize] endpoint fetch errors, skipping models:', [...failedModelKeys])
  }

  const rawEndpoints = bundle.data.models.flatMap((m) =>
    Array.isArray(m.endpoints) ? m.endpoints : [],
  )

  const modelsMap = new Map<string, MaterializedModel>()
  const endpointsMap = new Map<string, MaterializedEndpoint>()
  const providersMap = new Map<string, MaterializedProvider>()

  // * sources - raw API artifacts keyed by entity key
  const modelSourcesMap = new Map<string, Record<string, unknown>>()
  const endpointSourcesMap = new Map<string, Record<string, unknown>>()
  const providerSourcesMap = new Map<string, Record<string, unknown>>()

  const issues: string[] = []

  for (const raw of rawEndpoints) {
    const parsed = EndpointTransformSchema.safeParse(raw)

    if (!parsed.success) {
      issues.push(z.prettifyError(parsed.error))
      continue
    }

    const { model, endpoint, provider } = parsed.data
    modelsMap.set(model.slug, model)
    endpointsMap.set(endpoint.uuid, endpoint)
    providersMap.set(provider.slug, provider)

    // * collect raw sources - use model_variant_slug as key (matches transformed model.slug)
    const rawRecord = raw as Record<string, unknown>
    modelSourcesMap.set(model.slug, rawRecord.model as Record<string, unknown>)
    endpointSourcesMap.set(endpoint.uuid, rawRecord)
    // provider sources come from bundle.data.providers, collected separately
  }

  // * collect provider sources from bundle
  for (const rawProvider of bundle.data.providers) {
    const slug = rawProvider.slug as string
    if (slug && providersMap.has(slug)) {
      providerSourcesMap.set(slug, rawProvider)
    }
  }

  if (issues.length) {
    const consolidatedIssues = R.pipe(
      issues,
      R.countBy((x) => x),
      R.entries(),
      R.map(([msg, count]) => (count > 1 ? `${msg} (x${count})` : msg)),
    )
    console.error('[materialize:endpoints]', { issues: consolidatedIssues })
  }

  return {
    models: [...modelsMap.values()],
    endpoints: [...endpointsMap.values()],
    providers: [...providersMap.values()],
    sources: {
      models: [...modelSourcesMap.entries()].map(([key, data]) => ({ key, data })),
      endpoints: [...endpointSourcesMap.entries()].map(([key, data]) => ({ key, data })),
      providers: [...providerSourcesMap.entries()].map(([key, data]) => ({ key, data })),
    },
    failedModelKeys,
    issues,
  }
}

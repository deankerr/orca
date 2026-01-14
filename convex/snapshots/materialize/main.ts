import { v, type Infer } from 'convex/values'
import * as R from 'remeda'
import { z } from 'zod'

import { db } from '@/convex/db'

import { internal } from '../../_generated/api'
import { internalAction } from '../../_generated/server'
import type { CrawlArchiveBundle } from '../crawl/main'
import { getArchiveBundleOrThrow } from '../shared/bundle'
import { EndpointTransformSchema } from './validators/endpoints'

export const run = internalAction({
  args: { crawl_id: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const bundle = await getArchiveBundleOrThrow(ctx, args.crawl_id)

    console.log(`[materialize]`, { crawl_id: bundle.crawl_id })

    const { models, endpoints, providers, sources } = materializeModelEndpoints(bundle)

    if (endpoints.length === 0) {
      console.warn(`[materialize] abort: no endpoints found`)
      return
    }

    await ctx.runMutation(internal.snapshots.materialize.output.upsert, {
      models,
      endpoints,
      providers,
      crawl_id: bundle.crawl_id,
    })

    await ctx.runMutation(internal.snapshots.materialize.output.upsertSources, {
      sources,
    })

    // * schedule materializeChanges
    await ctx.scheduler.runAfter(0, internal.snapshots.materializedChanges.main.run, {})
  },
})

export function materializeModelEndpoints(bundle: CrawlArchiveBundle) {
  const rawEndpoints = bundle.data.models.flatMap((m) => m.endpoints)

  const modelsMap = new Map<
    string,
    Omit<Infer<typeof db.or.views.models.vTable.validator>, 'updated_at'>
  >()
  const endpointsMap = new Map<
    string,
    Omit<Infer<typeof db.or.views.endpoints.vTable.validator>, 'updated_at'>
  >()
  const providersMap = new Map<
    string,
    Omit<Infer<typeof db.or.views.providers.vTable.validator>, 'updated_at'>
  >()

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
    const slug = (rawProvider as Record<string, unknown>).slug as string
    if (slug && providersMap.has(slug)) {
      providerSourcesMap.set(slug, rawProvider as Record<string, unknown>)
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
    models: Array.from(modelsMap.values()),
    endpoints: Array.from(endpointsMap.values()),
    providers: Array.from(providersMap.values()),
    sources: {
      models: Array.from(modelSourcesMap.entries()).map(([key, data]) => ({ key, data })),
      endpoints: Array.from(endpointSourcesMap.entries()).map(([key, data]) => ({ key, data })),
      providers: Array.from(providerSourcesMap.entries()).map(([key, data]) => ({ key, data })),
    },
    issues,
  }
}

import { z } from 'zod'

import { internal } from '../../_generated/api'
import { internalAction } from '../../_generated/server'
import { Endpoint } from './parsers/endpoint'
import { Model } from './parsers/model'
import { scanCatalog } from './scan'

export const ingestCatalog = internalAction({
  args: {},
  handler: async (ctx) => {
    const catalog = await scanCatalog()

    // one write timestamp for the whole run
    const updated_at = Date.now()

    // providers are discovered from endpoints and deduped by [provider_id]
    const providers = new Map<string, z.output<typeof Endpoint>['provider']>()

    // isolate unparsable records so one bad record doesn't fail the run
    const issues: string[] = []
    for (const item of catalog.data) {
      const parsedModel = Model.safeParse(item.model)

      // a bad model record invalidates the whole item, endpoints included
      if (!parsedModel.success) {
        issues.push(z.prettifyError(parsedModel.error))
        continue
      }

      await ctx.runMutation(internal.meps2.scan.queries.upsertModel, {
        model: { ...parsedModel.data, model_id: item.model_id, variant: item.variant, updated_at },
      })

      for (const raw of item.endpoints ?? []) {
        const parsedEndpoint = Endpoint.safeParse(raw)

        if (!parsedEndpoint.success) {
          issues.push(z.prettifyError(parsedEndpoint.error))
          continue
        }

        const { endpoint, provider } = parsedEndpoint.data

        await ctx.runMutation(internal.meps2.scan.queries.upsertEndpoint, {
          endpoint: { ...endpoint, updated_at },
        })
        providers.set(provider.provider_id, provider)
      }
    }

    for (const provider of providers.values()) {
      await ctx.runMutation(internal.meps2.scan.queries.upsertProvider, {
        provider: { ...provider, updated_at },
      })
    }

    if (issues.length > 0) {
      console.error('[meps2:scan.ingestCatalog] skipped unparsable records', { issues })
    }
  },
})

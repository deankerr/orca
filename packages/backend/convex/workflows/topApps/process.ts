import { v } from 'convex/values'
import { up } from 'up-fetch'
import { z } from 'zod'

import { internal } from '../../_generated/api'
import { internalAction, internalQuery } from '../../_generated/server'
import { storeR2Artifact } from '../../lib/r2'

const orFetch = up(fetch, () => ({
  baseUrl: 'https://openrouter.ai',
  retry: {
    attempts: 3,
    delay: (ctx) => ctx.attempt ** 2 * 1000,
  },
}))

const DataRecord = z
  .object({ data: z.record(z.string(), z.unknown()) })
  .transform((value) => value.data)

const ModelTarget = v.object({
  slug: v.string(),
  version_slug: v.string(),
  variant: v.string(),
})

export const listTargets = internalQuery({
  args: {},
  returns: v.array(ModelTarget),
  handler: async (ctx) => {
    const models = await ctx.db.query('or_views_models').collect()

    return models
      .filter((model) => model.unavailable_at === undefined)
      .map((model) => ({
        slug: model.slug,
        version_slug: model.version_slug,
        variant: model.variant,
      }))
  },
})

export const run = internalAction({
  args: {
    timestamp: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const targets = await ctx.runQuery(internal.workflows.topApps.process.listTargets, {})
    const models: Array<{
      slug: string
      version_slug: string
      variant: string
      topApps: z.infer<typeof DataRecord>
    }> = []

    for (const target of targets) {
      try {
        const topApps = await orFetch('/api/frontend/stats/top-apps-for-model', {
          params: { permaslug: target.version_slug, variant: target.variant },
          schema: DataRecord,
        })

        models.push({ ...target, topApps })
      } catch (error) {
        console.error('failed to fetch top apps', error)
      }
    }

    await storeR2Artifact({
      workflow: 'top-apps',
      timestamp: args.timestamp,
      format_version: 1,
      data: { models },
    })

    return null
  },
})

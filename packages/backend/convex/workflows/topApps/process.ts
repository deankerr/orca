import { v } from 'convex/values'
import { up } from 'up-fetch'
import { z } from 'zod'

import { internalAction } from '../../_generated/server'
import { store } from '../../objects'
import { TopAppsTargets } from './targets'

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

export const run = internalAction({
  args: {
    timestamp: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const targets = await orFetch('/api/v1/models', {
      params: { output_modalities: 'all' },
      schema: TopAppsTargets,
    })

    const models: Array<{
      slug: string
      version_slug: string
      variant: string
      topApps: z.infer<typeof DataRecord>
    }> = []

    for (const target of targets) {
      try {
        const topApps = await orFetch('/api/frontend/v1/stats/top-apps-for-model', {
          params: { permaslug: target.version_slug, variant: target.variant },
          schema: DataRecord,
        })

        models.push({ ...target, topApps })
      } catch (error) {
        console.error('failed to fetch top apps', error)
      }
    }

    const path = 'top-apps'
    const name = new Date(args.timestamp).toISOString().replace('T', '/')

    await store(ctx, {
      path,
      name,
      text: JSON.stringify({
        workflow: path,
        timestamp: args.timestamp,
        format_version: 1,
        data: { models },
      }),
    })

    return null
  },
})

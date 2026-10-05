import { v } from 'convex/values'
import { up } from 'up-fetch'
import { z } from 'zod'

import { internal } from '#generated/api'
import { env, internalAction, internalMutation } from '#generated/server'

import { store } from '../objects'

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

/** Official model identities mapped to the existing archive and frontend stats contract. */
export const TopAppsTargets = z
  .object({
    data: z.array(
      z.object({
        id: z.string().regex(/^[^:\s]+(?::[^:\s]+)?$/),
        canonical_slug: z.string().min(1),
      }),
    ),
  })
  .transform(({ data }) =>
    data
      // Match scan collection: latest aliases duplicate canonical model targets.
      .filter((model) => !model.id.startsWith('~'))
      .map((model) => ({
        slug: model.id,
        version_slug: model.canonical_slug,
        variant: model.id.split(':')[1] ?? 'standard',
      })),
  )

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

export const scheduled = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    if (env.ORCA_TOP_APPS_CRON_ENABLED !== 'true') {
      return null
    }

    const timestampDate = new Date()
    timestampDate.setUTCSeconds(0, 0)

    await ctx.scheduler.runAfter(0, internal.collectors.topApps.run, {
      timestamp: timestampDate.getTime(),
    })

    return null
  },
})

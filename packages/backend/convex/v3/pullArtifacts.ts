import { ConvexError, v } from 'convex/values'

import { internal } from '../_generated/api'
import { env, internalAction } from '../_generated/server'
import { store } from '../objects'

/** Copy named scan artifacts from the configured source, retaining their identities. */
export const run = internalAction({
  args: { filenames: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, { filenames }) => {
    const source = env.ORCA_PULL_SOURCE_URL

    if (source === undefined || source === '') {
      throw new ConvexError('ORCA_PULL_SOURCE_URL is required')
    }

    for (const name of filenames) {
      const identity = { path: 'scans', name }
      const existing = await ctx.runQuery(internal.objects.locators.get, identity)

      if (existing !== null) {
        continue
      }

      const url = new URL('/objects', source.replace('.convex.cloud', '.convex.site'))
      url.search = new URLSearchParams(identity).toString()
      const response = await fetch(url)

      if (!response.ok) {
        throw new ConvexError(`Artifact pull failed for ${name}: ${response.status}`)
      }

      await store(ctx, { ...identity, text: await response.text() })
      console.log('stored artifact', name)
    }

    return null
  },
})

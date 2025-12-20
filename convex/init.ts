import { internal } from './_generated/api'
import { internalMutation } from './_generated/server'

// run a single initial snapshot

const init = internalMutation({
  handler: async (ctx) => {
    console.log('[init] snapshot')

    const endpoint = await ctx.db.query('or_views_endpoints').first()
    if (endpoint) {
      console.log('[init] abort: or_views_endpoints is not empty')
      return
    }

    await ctx.scheduler.runAfter(1000 * 60, internal.snapshots.crawl.main.run, {
      uptimes: false,
      topApps: false,
      analytics: true,
      onComplete: {
        materialize: true,
      },
    })
  },
})

export default init

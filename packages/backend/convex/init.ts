import { internal } from './_generated/api'
import { internalMutation } from './_generated/server'

// runs automatically on preview deployments

const init = internalMutation({
  handler: async (ctx) => {
    // v3 idempotent seed from default source (production)
    await ctx.scheduler.runAfter(0, internal.v3.projections.pull.run, {})

    // run legacy snapshot
    console.log('[init] snapshot')
    const endpoint = await ctx.db.query('or_views_endpoints').first()

    if (endpoint) {
      console.log('[init] abort: or_views_endpoints is not empty')
      return
    }

    await ctx.scheduler.runAfter(0, internal.snapshots.crawl.main.run, {
      uptimes: true,
      topApps: true,
      analytics: true,
      onComplete: {
        materialize: true,
      },
    })
  },
})

export default init

/**
 * Convex action wrapper for the Effect-based crawl prototype.
 *
 * This is a separate action that doesn't interfere with the production crawl.
 * It runs the Effect pipeline and stores results the same way as the existing crawl.
 */
import { v } from 'convex/values'

import { gzipSync } from 'fflate'
import prettyBytes from 'pretty-bytes'

import { internal } from '../../_generated/api'
import { internalAction } from '../../_generated/server'
import { type EffectCrawlResult, runEffectCrawl } from './effect-crawl'

export const run = internalAction({
  args: {
    uptimes: v.boolean(),
    topApps: v.boolean(),
    analytics: v.boolean(),
    onComplete: v.object({
      materialize: v.boolean(),
    }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    console.log(`[effect-crawl:action] starting`, args)

    // Run the Effect pipeline — yields back a plain JS object
    const bundle = await runEffectCrawl({
      uptimes: args.uptimes,
      topApps: args.topApps,
      analytics: args.analytics,
    })

    // Log recovered errors summary
    if (bundle.recoveredErrors.length > 0) {
      console.log(`[effect-crawl:action] recovered errors: ${bundle.recoveredErrors.length}`, {
        errors: bundle.recoveredErrors.slice(0, 10),
      })
    }

    // Store using the same format as the existing crawl
    await storeEffectCrawlBundle(ctx, bundle)
    console.log(`[effect-crawl:action] complete`, { crawl_id: bundle.crawl_id })

    if (args.onComplete.materialize) {
      await ctx.scheduler.runAfter(0, internal.snapshots.materialize.main.run, {})
    }
  },
})

/**
 * Store the Effect crawl result in the same format as the existing crawl.
 * Converts the Effect result shape back to the archive bundle format.
 */
async function storeEffectCrawlBundle(
  ctx: { storage: { store: (blob: Blob) => Promise<string> }; runMutation: typeof Function.prototype },
  bundle: EffectCrawlResult,
) {
  // Convert to the existing archive bundle format
  const archiveBundle = {
    crawl_id: bundle.crawl_id,
    args: bundle.args,
    data: {
      models: bundle.data.models.map((m) => ({
        model: m.model,
        endpoints: m.endpoints,
        uptimes: m.uptimes,
        apps: m.apps,
        ...(m.topApps ? { topApps: m.topApps } : {}),
      })),
      providers: bundle.data.providers,
      modelAuthors: bundle.data.modelAuthors,
      ...(bundle.data.analytics ? { analytics: bundle.data.analytics } : {}),
    },
  }

  const jsonString = JSON.stringify(archiveBundle)
  const encoded = new TextEncoder().encode(jsonString)
  const compressed = gzipSync(encoded)

  const blob = new Blob([new Uint8Array(compressed)])
  const storage_id = await ctx.storage.store(blob)

  const size = {
    raw: encoded.byteLength,
    blob: blob.size,
  }

  const totals = {
    models: archiveBundle.data.models.length,
    endpoints: archiveBundle.data.models.reduce((sum, m) => sum + m.endpoints.length, 0),
    uptimes: archiveBundle.data.models.reduce((sum, m) => sum + m.uptimes.length, 0),
    topApps: archiveBundle.data.models.reduce((sum, m) => sum + (m.topApps ? 1 : 0), 0),
    providers: archiveBundle.data.providers.length,
    analytics: archiveBundle.data.analytics ? 1 : 0,
  }

  await ctx.runMutation(internal.snapshots.crawl.outputs.insert, {
    crawl_id: archiveBundle.crawl_id,
    storage_id,
    data: { totals, size },
  })

  console.log(`[effect-crawl:store]`, {
    crawl_id: archiveBundle.crawl_id,
    totals,
    size: {
      raw: prettyBytes(size.raw),
      blob: prettyBytes(size.blob),
      ratio: Math.round((size.blob / size.raw) * 1000) / 1000,
    },
  })
}

import { v } from 'convex/values'

import { internal } from '../../_generated/api'
import { internalAction, internalMutation } from '../../_generated/server'
import { loadEntities, loadPair } from '../scan'
import { getModule } from './registry'
import { createModuleCursor } from './state'
import { moduleName } from './table'

/** Manual entry point: create a module's baseline cursor and schedule its catch-up. Rejects repeats. */
export const startModule = internalMutation({
  args: { module: moduleName },
  returns: v.null(),
  handler: async (ctx, { module }) => {
    getModule(module)
    console.log('[v4:ingestion] start module', { module, inserts: 1 })
    await createModuleCursor(ctx, module)
    await ctx.scheduler.runAfter(0, internal.v4.ingestion.modules.catchUpModule, { module })
    return null
  },
})

/**
 * Manual recovery entry point for an already-started module; one step per scheduled action.
 * Replay modules follow declared pairs; latest-only modules jump to the Catalog clock.
 */
export const catchUpModule = internalAction({
  args: { module: moduleName },
  returns: v.null(),
  handler: async (ctx, { module }) => {
    const definition = getModule(module)
    const step = await ctx.runQuery(internal.v4.ingestion.progress.getNextModuleStep, {
      module,
      latestOnly: definition.catchUp === 'latest',
    })
    if (step === null) {
      return null
    }
    const { cursor, from_scan_at, scan_at } = step
    const pair =
      from_scan_at === null
        ? { previous: null, next: await loadEntities(ctx, scan_at) }
        : await loadPair(ctx, { from_scan_at, scan_at })
    await definition.process(ctx, pair, { module, cursor, scan_at })
    await ctx.scheduler.runAfter(0, internal.v4.ingestion.modules.catchUpModule, { module })
    return null
  },
})

import { v } from 'convex/values'

import { defineMutationSpec } from '../../lib/functionSpec'
import { getStateAt } from './queries'
import { contentFields } from './schema'

export const commit = defineMutationSpec({
  args: {
    contentHash: v.string(),
    next: v.object({
      content: v.object(contentFields),
      entity: v.object({
        id: v.string(),
        label: v.string(),
      }),
    }),
    observedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const state = await getStateAt(ctx, { id: args.next.entity.id, observedAt: args.observedAt })

    const isAvailable = state !== null && state.isAvailable
    const isIdentical = state !== null && state.contentHash === args.contentHash

    if (isAvailable && isIdentical) {
      return
    }

    const materializedCurrent = {
      ...args.next.content,
      unavailableAt: undefined,
      unavailableAtSortKey: Number.MAX_SAFE_INTEGER,
    }

    const viewId = await (async () => {
      if (state === null) {
        return ctx.db.insert('catalog_models_views', materializedCurrent)
      }
      await ctx.db.replace(state.viewId, materializedCurrent)
      return state.viewId
    })()

    const snapshotId =
      state !== null && isIdentical
        ? state.snapshotId
        : await ctx.db.insert('catalog_models_snapshots', args.next.content)

    await ctx.db.insert('catalog_models_state', {
      contentHash: args.contentHash,
      entity: args.next.entity,
      observedAt: args.observedAt,
      snapshotId,
      viewId,
    })
  },
})

export const markUnavailable = defineMutationSpec({
  args: {
    ids: v.array(v.string()),
    observedAt: v.number(),
  },
  handler: async (ctx, args) => {
    for (const id of args.ids) {
      const state = await getStateAt(ctx, { id })

      if (state === null || !state.isAvailable) {
        continue
      }

      await ctx.db.patch(state.viewId, {
        unavailableAt: args.observedAt,
        unavailableAtSortKey: args.observedAt,
      })

      await ctx.db.insert('catalog_models_state', {
        contentHash: state.contentHash,
        entity: state.entity,
        observedAt: args.observedAt,
        snapshotId: state.snapshotId,
        unavailableAt: args.observedAt,
        viewId: state.viewId,
      })
    }
  },
})

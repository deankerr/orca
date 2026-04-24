import { v } from 'convex/values'

import { defineMutationSpec } from '../../lib/functionSpec'
import { getState, getStateAt } from './queries'
import { contentFields } from './schema'

export const commit = defineMutationSpec({
  args: {
    next: v.object({
      entity: v.object({
        id: v.string(),
        label: v.string(),
      }),
      content: v.object(contentFields),
    }),
    observedAt: v.number(),
    contentHash: v.string(),
  },
  handler: async (ctx, args) => {
    // Re-read the prior provider state inside the transaction boundary.
    const state = await getStateAt(ctx, {
      id: args.next.entity.id,
      observedAt: args.observedAt,
    })
    const contentChanged = state?.contentHash !== args.contentHash
    const becameAvailable = state?.unavailableAt !== undefined

    if (!contentChanged && !becameAvailable) {
      return
    }

    // Insert changed content, or reuse the prior content row for state-only changes.
    const rowId = contentChanged
      ? await ctx.db.insert('catalog_providers_content', args.next.content)
      : state.rowId

    await ctx.db.insert('catalog_providers', {
      entity: args.next.entity,
      observedAt: args.observedAt,
      rowId,
      contentHash: args.contentHash,
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
      const state = await getState(ctx, id)

      if (!state || state.unavailableAt !== undefined) {
        continue
      }

      await ctx.db.insert('catalog_providers', {
        entity: state.entity,
        observedAt: args.observedAt,
        rowId: state.rowId,
        contentHash: state.contentHash,
        unavailableAt: args.observedAt,
      })
    }
  },
})

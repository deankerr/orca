import { v } from 'convex/values'

import { defineMutationSpec, defineQuerySpec } from '../../lib/functionSpec'
import { createContentHash } from './hash'

export type EntityIdentity = {
  entityKind: string
  entityAspect: string
  entityKey: string
}

export type EntityRecord = EntityIdentity & {
  sinceAt: number
  contentHash: string
  source: {
    locator: string
    storageId?: string
  }
}

export const get = defineQuerySpec({
  args: {
    entityKind: v.string(),
    entityAspect: v.string(),
    entityKey: v.string(),
  },
  handler: async (ctx, args) =>
    ctx.db
      .query('catalog_registry')
      .withIndex('by_entity_kind__entity_aspect__entity_key__since_at', (q) =>
        q
          .eq('entity_kind', args.entityKind)
          .eq('entity_aspect', args.entityAspect)
          .eq('entity_key', args.entityKey),
      )
      .order('desc')
      .first(),
})

export const check = defineQuerySpec({
  args: {
    contentHash: v.string(),
  },
  handler: async (ctx, args) =>
    ctx.db
      .query('catalog_registry')
      .withIndex('by_content_hash', (q) => q.eq('content_hash', args.contentHash))
      .first(),
})

export const bump = defineMutationSpec({
  args: {
    entityKind: v.string(),
    entityAspect: v.string(),
    entityKey: v.string(),

    sinceAt: v.number(),
    source: v.object({
      locator: v.string(),
      storageId: v.optional(v.string()),
    }),

    data: v.record(v.string(), v.any()),
  },
  handler: async (ctx, args) => {
    const contentHash = await createContentHash(args.data)

    const { entityKind, entityAspect, entityKey } = args
    const record = await get.handler(ctx, { entityKind, entityAspect, entityKey })

    if (record?.content_hash === contentHash) {
      return null
    }

    const sequence = (record?.sequence ?? 0) + 1

    const stateId = await ctx.db.insert('catalog_registry', {
      entity_kind: args.entityKind,
      entity_aspect: args.entityAspect,
      entity_key: args.entityKey,
      since_at: args.sinceAt,
      sequence,
      source: {
        locator: args.source.locator,
        storage_id: args.source.storageId,
      },
      content_hash: contentHash,
    })

    return { stateId, sequence }
  },
})

import { v } from 'convex/values'

import { defineMutationSpec, defineQuerySpec } from '../../lib/functionSpec'
import { catalogScopeTableValidator } from '../shared'
import { createContentHash } from './hash'

export type VersionIdentity = {
  scopeTable: string
  id: string
}

export type VersionRecord = VersionIdentity & {
  firstSeenAt: number
  contentHash: string
}

export const get = defineQuerySpec({
  args: {
    scopeTable: catalogScopeTableValidator,
    id: v.string(),
  },
  handler: async (ctx, args) =>
    ctx.db
      .query('catalog_versions')
      .withIndex('by_scopeTable__id__firstSeenAt', (q) =>
        q.eq('scopeTable', args.scopeTable).eq('id', args.id),
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
      .query('catalog_versions')
      .withIndex('by_contentHash', (q) => q.eq('contentHash', args.contentHash))
      .first(),
})

export const bump = defineMutationSpec({
  args: {
    scopeTable: catalogScopeTableValidator,
    id: v.string(),
    firstSeenAt: v.number(),
    data: v.record(v.string(), v.any()),
  },
  handler: async (ctx, args) => {
    const contentHash = await createContentHash(args.data)

    const { scopeTable, id } = args
    const record = await get.handler(ctx, { scopeTable, id })

    if (record?.contentHash === contentHash) {
      return null
    }

    const version = (record?.version ?? 0) + 1

    const versionId = await ctx.db.insert('catalog_versions', {
      scopeTable: args.scopeTable,
      id: args.id,
      firstSeenAt: args.firstSeenAt,
      version,
      contentHash,
    })

    return { versionId, version }
  },
})

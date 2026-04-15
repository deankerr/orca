import { v } from 'convex/values'

import { defineMutationSpec, defineQuerySpec } from '../../lib/functionSpec'
import { catalogScopeTableValidator, catalogSourceValidator } from '../shared'
import { createContentHash } from './hash'

export type VersionIdentity = {
  scopeTable: string
  id: string
}

export type VersionRecord = VersionIdentity & {
  firstSeenAt: number
  contentHash: string
  source: {
    locator: string
    storageId?: string
  }
}

export const get = defineQuerySpec({
  args: {
    scopeTable: catalogScopeTableValidator,
    id: v.string(),
  },
  handler: async (ctx, args) =>
    ctx.db
      .query('catalog_versions')
      .withIndex('by_scope_table__id__first_seen_at', (q) =>
        q.eq('scope_table', args.scopeTable).eq('id', args.id),
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
      .withIndex('by_content_hash', (q) => q.eq('content_hash', args.contentHash))
      .first(),
})

export const bump = defineMutationSpec({
  args: {
    scopeTable: catalogScopeTableValidator,
    id: v.string(),
    firstSeenAt: v.number(),
    source: catalogSourceValidator,
    data: v.record(v.string(), v.any()),
  },
  handler: async (ctx, args) => {
    const contentHash = await createContentHash(args.data)

    const { scopeTable, id } = args
    const record = await get.handler(ctx, { scopeTable, id })

    if (record?.content_hash === contentHash) {
      return null
    }

    const version = (record?.version ?? 0) + 1

    const versionId = await ctx.db.insert('catalog_versions', {
      scope_table: args.scopeTable,
      id: args.id,
      first_seen_at: args.firstSeenAt,
      version,
      source: args.source,
      content_hash: contentHash,
    })

    return { versionId, version }
  },
})

import { ConvexError, v } from 'convex/values'

import { internalMutation, internalQuery } from '../_generated/server'
import { OBJECTS_LOCATORS_TABLE, locatorsTable } from './table'

const locator = locatorsTable.validator

/**
 * Locator for this identity. Private to `objects`.
 *
 * @returns The locator, or `null` if nothing was stored under this pair.
 */
export const get = internalQuery({
  args: {
    path: v.string(),
    name: v.string(),
  },
  returns: v.union(v.null(), locator),
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query(OBJECTS_LOCATORS_TABLE)
      .withIndex('by_path_name', (q) => q.eq('path', args.path).eq('name', args.name))
      .unique()

    if (doc === null) {
      return null
    }

    if (doc.backend === 'r2') {
      const { path, name, backend, r2_key, codec, size } = doc
      return { path, name, backend, r2_key, codec, size }
    }

    const { path, name, backend, storage_id, codec, size } = doc
    return { path, name, backend, storage_id, codec, size }
  },
})

/** Return the first object name ordered after `afterName` within a path. */
export const nextName = internalQuery({
  args: {
    path: v.string(),
    afterName: v.string(),
  },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, args) => {
    const locator = await ctx.db
      .query(OBJECTS_LOCATORS_TABLE)
      .withIndex('by_path_name', (q) => q.eq('path', args.path).gt('name', args.afterName))
      .first()

    return locator?.name ?? null
  },
})

/**
 * Insert a locator. Insert-only.
 *
 * @throws {ConvexError} If `(path, name)` is already present.
 */
export const insert = internalMutation({
  args: { locator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query(OBJECTS_LOCATORS_TABLE)
      .withIndex('by_path_name', (q) =>
        q.eq('path', args.locator.path).eq('name', args.locator.name),
      )
      .unique()

    if (existing !== null) {
      throw new ConvexError({
        message: 'object already exists',
        path: args.locator.path,
        name: args.locator.name,
      })
    }

    await ctx.db.insert(OBJECTS_LOCATORS_TABLE, args.locator)
    return null
  },
})

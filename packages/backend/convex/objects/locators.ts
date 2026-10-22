import { ConvexError, v } from 'convex/values'

import { internalMutation, internalQuery } from '#generated/server'

import { findLocalNames } from './local'
import { nameSelection } from './protocol'
import { OBJECTS_LOCATORS_TABLE, locatorsTable } from './table'

const locator = locatorsTable.validator

/** Local discovery step for the canonical object reader. */
export const namesAtOrAfter = internalQuery({
  args: nameSelection.fields,
  handler: findLocalNames,
  returns: v.array(v.string()),
})

/**
 * Locator for this identity. Private to `objects`.
 *
 * @returns The locator, or `null` if nothing was stored under this pair.
 */
export const get = internalQuery({
  args: {
    name: v.string(),
    path: v.string(),
  },
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
      return { backend, codec, name, path, r2_key, size }
    }

    const { path, name, backend, storage_id, codec, size } = doc
    return { backend, codec, name, path, size, storage_id }
  },
  returns: v.union(v.null(), locator),
})

/**
 * Insert a locator. Insert-only.
 *
 * @throws {ConvexError} If `(path, name)` is already present.
 */
export const insert = internalMutation({
  args: { locator },
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
        name: args.locator.name,
        path: args.locator.path,
      })
    }

    await ctx.db.insert(OBJECTS_LOCATORS_TABLE, args.locator)
    return null
  },
  returns: v.null(),
})

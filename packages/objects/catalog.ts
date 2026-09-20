import { defineTable } from 'convex/server'
import { ConvexError, v } from 'convex/values'
import type { Infer } from 'convex/values'

import { exposeOperations } from './lib/function-spec'
import type { ReferenceFor } from './lib/function-spec'
import { defineTableModule } from './lib/table'
import type { LiteralName } from './lib/table'

const identity = { name: v.string(), path: v.string() }
const entry = v.object({ ...identity, storageId: v.id('_storage') })
const table = defineTable(entry).index('by_path_name', ['path', 'name'])
export type ObjectEntry = Infer<typeof entry>
export type ObjectIdentity = Pick<ObjectEntry, 'name' | 'path'>
type Definitions = ReturnType<typeof defineObjectCatalog>['definitions']
export type ObjectCatalogReferences = {
  lookup: ReferenceFor<'query', Definitions['lookup']>
  insert: ReferenceFor<'mutation', Definitions['insert']>
  remove: ReferenceFor<'mutation', Definitions['remove']>
}

/** Bind schema and operations to one consumer-chosen table name. No generated imports. */
export function defineObjectCatalog<const Name extends string>({
  table: name,
}: {
  table: Name & LiteralName<Name>
}) {
  const { tables, readOperation, writeOperation } = defineTableModule<Name, typeof table>(
    name,
    table,
  )

  const lookup = readOperation({
    args: identity,
    handler: async ({ db }, args) => {
      const row = await db
        .query(name)
        .withIndex('by_path_name', (q) => q.eq('path', args.path).eq('name', args.name))
        .unique()
      return row === null ? null : { name: row.name, path: row.path, storageId: row.storageId }
    },
    returns: v.union(entry, v.null()),
  })

  const insert = writeOperation({
    args: entry.fields,
    handler: async (ctx, args) => {
      const { db } = ctx
      const existing = await lookup.handler(ctx, args)
      if (existing !== null) {
        return false
      }
      if ((await db.system.get(args.storageId)) === null) {
        throw new ConvexError('Object file does not exist')
      }
      await db.insert(name, args)
      return true
    },
    returns: v.boolean(),
  })

  const remove = writeOperation({
    args: identity,
    handler: async ({ db, storage }, args) => {
      const row = await db
        .query(name)
        .withIndex('by_path_name', (q) => q.eq('path', args.path).eq('name', args.name))
        .unique()
      if (row === null) {
        return false
      }
      if ((await db.system.get(row.storageId)) !== null) {
        await storage.delete(row.storageId)
      }
      await db.delete(row._id)
      return true
    },
    returns: v.boolean(),
  })

  return { ...exposeOperations({ insert, lookup, remove }), tables }
}

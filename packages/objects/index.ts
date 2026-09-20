import type { GenericActionCtx, GenericDataModel } from 'convex/server'
import { ConvexError } from 'convex/values'

import type { ObjectCatalogReferences, ObjectIdentity } from './catalog'

export { defineObjectCatalog } from './catalog'

export type { ObjectCatalogReferences, ObjectEntry, ObjectIdentity } from './catalog'

type Context<Model extends GenericDataModel> = GenericActionCtx<Model>

/** Explicit client type keeps app-generated reference inference out of the return contract. */
export type ObjectStore<Model extends GenericDataModel> = {
  load: (ctx: Context<Model>, identity: ObjectIdentity) => Promise<string | null>
  remove: (ctx: Context<Model>, identity: ObjectIdentity) => Promise<boolean>
  store: (ctx: Context<Model>, input: ObjectIdentity & { text: string }) => Promise<void>
}

/** Action-side helpers. Only the catalog operations need Convex registration. */
export function createObjectStore<Model extends GenericDataModel>({
  catalog,
}: {
  catalog: ObjectCatalogReferences
}): ObjectStore<Model> {
  return {
    async load(ctx: Context<Model>, identity: ObjectIdentity) {
      const entry = await ctx.runQuery(catalog.lookup, identity)
      if (entry === null) {
        return null
      }
      const blob = await ctx.storage.get(entry.storageId)
      if (blob === null) {
        throw new ConvexError({ ...identity, message: 'Object file is missing' })
      }
      return await blob.text()
    },
    async remove(ctx: Context<Model>, identity: ObjectIdentity) {
      return await ctx.runMutation(catalog.remove, identity)
    },
    async store(ctx: Context<Model>, args: ObjectIdentity & { text: string }) {
      const { name, path, text } = args
      const storageId = await ctx.storage.store(
        new Blob([text], { type: 'text/plain; charset=utf-8' }),
      )
      // Only a definite rejection is safe to clean up. A failed RPC can have committed.
      // ponytail: interrupted stores can leave orphan files; add a reconciliation sweep before production use.
      const inserted = await ctx.runMutation(catalog.insert, { name, path, storageId })
      if (!inserted) {
        await ctx.storage.delete(storageId)
        throw new ConvexError({ message: 'Object already exists', name, path })
      }
    },
  }
}

import { defineSchema, defineTable } from 'convex/server'
import type {
  DataModelFromSchemaDefinition,
  GenericQueryCtx,
  FunctionReference,
} from 'convex/server'
import { v } from 'convex/values'

import { defineObjectCatalog } from '../index'
import type { ObjectCatalogReferences, ObjectEntry } from '../index'
import { defineFunctionSpec } from '../lib/function-spec'
import { catalog } from './consumer'

const missingTable = defineSchema({ other: defineTable({ value: v.string() }) })
const missingIndex = defineSchema({
  renamed_files: defineTable({ name: v.string(), path: v.string(), storageId: v.id('_storage') }),
})
const wrongFields = defineSchema({
  renamed_files: defineTable({
    name: v.number(),
    path: v.string(),
    storageId: v.id('_storage'),
  }).index('by_path_name', ['path', 'name']),
})

// Compile-only checks: bun run fix must reject each intentionally invalid installation.
export function checkInstallationTypes(
  missing: GenericQueryCtx<DataModelFromSchemaDefinition<typeof missingTable>>,
  unindexed: GenericQueryCtx<DataModelFromSchemaDefinition<typeof missingIndex>>,
  references: ObjectCatalogReferences,
  wrong: GenericQueryCtx<DataModelFromSchemaDefinition<typeof wrongFields>>,
  wrongArgs: FunctionReference<'mutation', 'internal', { other: string }, boolean>,
  wrongResult: FunctionReference<'mutation', 'internal', ObjectEntry, string>,
) {
  // @ts-expect-error The consumer did not install the configured table.
  void catalog.lookup(missing, { name: 'a', path: 'b' })
  // @ts-expect-error Matching fields are insufficient without the package's index.
  void catalog.lookup(unindexed, { name: 'a', path: 'b' })
  // @ts-expect-error A mutation reference cannot serve as the lookup query.
  const invalid: ObjectCatalogReferences = { ...references, lookup: references.insert }
  // @ts-expect-error Indexes alone are insufficient when document fields differ.
  void catalog.lookup(wrong, { name: 'a', path: 'b' })
  // @ts-expect-error Mutation argument contracts must match.
  const invalidArgs: ObjectCatalogReferences = { ...references, insert: wrongArgs }
  // @ts-expect-error Mutation result contracts must match.
  const invalidResult: ObjectCatalogReferences = { ...references, insert: wrongResult }
  void invalidArgs
  void invalidResult
  return invalid
}

export function checkNames(widened: string, union: 'first' | 'second') {
  // @ts-expect-error A widened string would erase schema-key checking.
  defineObjectCatalog({ table: widened })
  // @ts-expect-error One runtime key must not claim two schema keys.
  defineObjectCatalog({ table: union })
}

const sync = defineFunctionSpec<object>()({
  args: { value: v.string() },
  handler: (_ctx, { value }) => value,
  returns: v.string(),
})
const asyncSpec = defineFunctionSpec<object>()({
  args: { value: v.string() },
  handler: async (_ctx, { value }) => value,
  returns: v.string(),
})
export const syncResult: string = sync.handler({}, { value: 'hello' })
export const asyncResult: Promise<string> = asyncSpec.handler({}, { value: 'hello' })

export const invalidReturn = defineFunctionSpec<object>()({
  args: { value: v.string() },
  // @ts-expect-error Return values are checked at definition time, before registration.
  handler: (_ctx, args) => args.value,
  returns: v.boolean(),
})

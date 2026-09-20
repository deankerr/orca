# Candidate module-building primitives

These helpers describe reusable Convex operations. They do not register functions,
choose visibility, or introduce a new execution context.

## Author a single-table module

```ts
const { tables, readOperation, writeOperation } = defineTableModule(name, table)

const lookup = readOperation({
  args: { key: v.string() },
  returns: v.union(v.number(), v.null()),
  handler: async (ctx, { key }) => {
    const row = await ctx.db
      .query(name)
      .withIndex('by_key', (q) => q.eq('key', key))
      .unique()
    return row?.value ?? null
  },
})

return { ...exposeOperations({ lookup }), tables }
```

Handlers use standard `GenericQueryCtx` / `GenericMutationCtx`. Storage, auth,
scheduler, and system-table APIs have their normal Convex availability. There is
one write-operation builder, including for operations that delete files. The name
and fixed table definition are the only setup inputs.

## One declaration, two consumer interfaces

```ts
await module.lookup(ctx, { key })
export const lookup = internalQuery(module.definitions.lookup)
```

`exposeOperations` copies each original handler into the direct-call surface and
retains the specifications under `definitions`. It never attaches metadata to a
callable function. Convex receives a conventional object specification when the
consumer registers an operation. `definitions` is a reserved operation name.
Both surfaces preserve the handler's actual sync/async result type.

## Type bridge

`table.ts` centralizes the unavoidable difference between two type views:

- **Implementation:** a standard context whose database knows the fixed table
  shape. The configurable table name is widened internally, but document IDs
  retain the configured name's brand. Access only that table and system tables.
- **Consumer:** the expected table name, document fields, and indexes are checked
  against the consuming app. Specializing the query signature is necessary;
  Convex's generic query method alone admitted incompatible schemas.

The context is unchanged at runtime. These assertions accommodate TypeScript's
conditional schema types; they provide neither runtime isolation nor permission
to query arbitrary app tables. Negative compile checks cover missing tables,
indexes, wrong documents, widened names, and name unions.

## Other pieces

- `defineFunctionSpec<Context>()`: plain validated definitions for code that already
  has its context type. Property-validator args map, required return validator,
  `(ctx, args)` handler. The table module supplies context-bound versions of this
  pattern with installation checking.
- `ReferenceFor<Kind, Spec>`: derives an internal reference contract from validators,
  independently of the consuming app's generated API.
- Callable operations are an alternative to reference contracts, described in the
  [package README](../README.md#alternative-consumer-supplied-callbacks). This package
  retains the reference-based implementation.

## Scope

Support one configured table per authoring context, plus standard system tables.
More complex modules can compose separately defined operations; cross-table schema
composition within one authoring context has not been designed here. Names are
single literals; schemas and indexes are fixed by the package.

No automatic registration, reference discovery, CRUD generation, policy hooks,
dynamic schemas, or support for every Convex builder overload. Runtime validation
occurs at registered entry points, not direct calls. The helpers stay experimental
in this package. Tests include a second, non-storage counter module using ordinary
`ctx.db.patch`, in addition to the objects catalog.

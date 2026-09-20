# Objects: a Convex library experiment

A named, insert-only text store using Convex files. This is an ordinary TypeScript
package, not a Convex component. It imports no app-generated code.

The goal is to replace repeated Convex storage boilerplate with one consistent
implementation. The object's behavior is fixed; consumers supply table names and
registered function locations, not custom storage policies or workflow hooks.
The reusable authoring helpers in `lib/` remain an experiment for further refinement.

The experiment separates **definitions**, **registration**, and **reference binding**.
ORCA's consumer is in `packages/backend/convex/objectExperiment/`, using the new
`experiment_object_files` table. The existing `convex/objects` module is independent.

## Extracting the experiment

Copy this directory, excluding `node_modules`, into a new repository or workspace.
Its manifest uses concrete dependency versions rather than monorepo catalogs, and
its TypeScript config is self-contained. From the copied directory:

```sh
bun install
bun test
```

The `tests/consumer.ts` fixture defines its own schema and registrations, so the
tests need neither ORCA nor a deployed Convex backend. `tests/types.ts` records
negative type checks for a type-aware checker; `bun test` runs the runtime checks.
The exports point to TypeScript source for a consuming bundler, not built JavaScript.

The ORCA consumer and CLI demo are integration examples outside this directory;
the setup below is sufficient to recreate them in another Convex app.

## Consumer setup

Define one installation with a literal table name:

```ts
// convex/objectDefinition.ts
import { defineObjectCatalog } from '@orca/objects'

export const catalog = defineObjectCatalog({ table: 'my_files' })
```

Include its schema contribution:

```ts
// convex/schema.ts
import { defineSchema } from 'convex/server'
import { catalog } from './objectDefinition'

export default defineSchema({ ...catalog.tables })
```

Every catalog operation is a plain function. Call it inside a query or mutation:

```ts
const entry = await catalog.lookup(ctx, { path, name })
```

Direct calls share the caller's transaction and bypass runtime argument validation,
like other TypeScript helpers. Register operations only when another execution
context needs to call them. The action-side store needs these three:

```ts
// convex/fileDatabase.ts
import { internalMutation, internalQuery } from './_generated/server'
import { catalog } from './objectDefinition'

export const find = internalQuery(catalog.definitions.lookup)
export const commit = internalMutation(catalog.definitions.insert)
export const erase = internalMutation(catalog.definitions.remove)
```

Bind the resulting references separately:

```ts
// convex/files.ts
import { createObjectStore } from '@orca/objects'
import type { ObjectStore } from '@orca/objects'
import { internal } from './_generated/api'
import type { DataModel } from './_generated/dataModel'

export const files: ObjectStore<DataModel> = createObjectStore({
  catalog: {
    lookup: internal.fileDatabase.find,
    insert: internal.fileDatabase.commit,
    remove: internal.fileDatabase.erase,
  },
})
```

Inside an action, use `files.store(ctx, { path, name, text })`,
`files.load(ctx, { path, name })`, and `files.remove(ctx, { path, name })`.
They are plain functions; no registered action wrapper is required.
The client annotation binds the app's model once and breaks generated-API inference
cycles. The client uses the full standard action context, not per-method subsets.

## Package authoring

The catalog uses `defineTableModule(name, table)` to obtain `tables`, `readOperation`,
and `writeOperation`. Handlers receive standard `GenericQueryCtx` or
`GenericMutationCtx` with the table's schema. Authors write `ctx.db.query(name)`,
`ctx.db.patch(...)`, `ctx.db.system.get(...)`, and `ctx.storage.delete(...)` normally.
These operation builders do not register functions or select public/internal visibility.

`exposeOperations({ lookup, insert, remove })` publishes the handlers as plain
functions and preserves the specs under `.definitions`. Both views use exactly the
same function; there is no wrapper, extra transaction, or runtime context adapter.

## Reusable patterns demonstrated

- **One table-name input:** the schema key and database operations derive from it.
  Multiple installations can coexist under different literal names.
- **Operation specifications:** `@orca/objects/lib/function-spec` infers arguments,
  checks handler results before registration, and preserves sync/async return types.
- **Installation checks at the seam:** `lib/table.ts` checks the consumer's table
  and indexes while exposing standard contexts to package implementations.
- **Derived reference contracts:** `ReferenceFor` derives arguments and results
  from operation validators. Function kinds remain explicit; consumer locations
  and export names are arbitrary.
- **Explicit client type:** `ObjectStore<DataModel>` prevents generated references
  from recursively determining their consuming client's type. Registration still
  depends only on definitions. No lazy callbacks or string paths are needed.

The candidate reusable primitives live in [`lib/`](./lib/README.md). Type assertions
are confined to its table-typing bridge and operation-map construction, plus the
test's generated-API stand-in.
Neither object-store logic nor consumer setup needs casts.
Types catch missing tables, missing indexes, and incompatible references; they
cannot prove a compatible reference actually implements the intended behavior,
or that the deployed schema matches the checked-in code.

## Alternative: consumer-supplied callbacks

We also implemented and tested a callback-based variant, then consolidated on
references because this object's behavior does not need direct customization.
The variant shared the same catalog, validators, schema installation, and explicit
registration. Only the action-side invocation seam changed.

Instead of accepting references and calling `ctx.runQuery` / `ctx.runMutation`,
the client accepted async functions taking `(ctx, args)`:

```ts
// Alternative design sketch, not an export of this package.
const objects = makeCallbackStore({
  catalog: {
    lookup: (ctx, args) => ctx.runQuery(internal.fileDatabase.find, args),
    insert: (ctx, args) => ctx.runMutation(internal.fileDatabase.commit, args),
    remove: (ctx, args) => ctx.runMutation(internal.fileDatabase.erase, args),
  },
})
```

The package could then use `catalog.insert(ctx, entry)`. Small `callQuery(ref)` and
`callMutation(ref)` adapters reduced the repeated wiring to a closure per reference.
Callbacks' args/results were derived from spec validators, and the consumer's
model was bound once so callbacks could use app-specific context APIs.

This makes adaptation and instrumentation ordinary consumer code, but does not
remove registration, references in the consumer, or action/database boundaries.
It adds concepts to the default installation and requires callbacks to preserve
the operation's semantics, not merely its types. Multiple mutation calls inside
one callback do not become atomic. A callback can commit and then throw; that
uncertainty must never trigger deletion of a potentially committed file.

For modules genuinely designed for consumer customization, this remains a useful
option. For a consistent object-store implementation, direct references are the
simpler contract. The callback implementation is intentionally retained only as
this design note, rather than as a second package to extract.

## Storage contract

- `store` creates a file then inserts its catalog entry; duplicate identities throw
  and the rejected file is deleted. The existing object is never overwritten.
- `load` returns text or `null`; a catalog entry with missing bytes throws.
- `remove` returns whether an entry existed. File and entry deletion happen in
  the same mutation, including when called directly from a larger transaction.
- Low-level `catalog.insert` returns `false` for an existing identity. The caller
  retains responsibility for its rejected file. Accepted files must be exclusively
  owned by that entry; do not attach the same file to multiple entries.
- Upload and catalog insertion cannot be one transaction. Interruptions or
  uncertain mutation results may leave orphan files; there is no reconciliation
  sweep in this experiment. An uncertain result never triggers file deletion.

Contents are UTF-8 text, without compression or R2. There is no overwrite/update
operation in this experiment.

## Checks

From the repository root:

```sh
bun run fix
bun test packages/objects/tests/objects.test.ts
```

`tests/types.ts` contains negative compile checks. The `convex-test` consumer uses
two fully wired installations and arbitrary function paths. It exercises
wrapped specs, action calls, direct calls, concurrent duplicate cleanup, and caller-transaction rollback of
both file deletion and catalog deletion. These are local checks, not a live
deployment or a performance benchmark.

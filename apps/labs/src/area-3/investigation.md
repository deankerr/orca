# Drizzle Bun SQLite With Effect

Area 3 investigates a local product-database boundary built from `bun:sqlite`,
`drizzle-orm/bun-sqlite`, and Effect. It intentionally does not reimplement Area 2's
materialization, diffing, migrations, or complete current-state replacement.

## Decision

Use Drizzle's direct Bun SQLite driver:

```ts
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'

const client = new Database(filename, { create: true, readwrite: true })
const database = drizzle({ client })
```

`drizzle-orm/bun-sqlite` is a synchronous driver. Drizzle creates prepared statements with the
native `Database` instance and executes them through `query(...).all()`, `.get()`, and `.run()`.
Its transaction callback is intentionally synchronous; passing an async function is a type error.

The application should retain ownership of the native connection in a scoped Effect layer:

1. Acquire `Database` with `Effect.acquireRelease` and close it in the finalizer.
2. Set Area 2's connection-local policy: foreign keys enabled, WAL, and normal synchronous mode.
3. Construct the Drizzle database from that owned client.
4. Expose narrow application operations returning `Effect`, not the raw Drizzle database.
5. Use `Effect.try` to convert synchronous database exceptions to `ProductDatabaseError`.
6. Serialize local writer fibers with a one-permit `Semaphore`; this follows the policy in
   Effect's own Bun SQLite client.

The demo in `product-database.ts` applies those rules. Its `appendCrawl` operation wraps one
synchronous Drizzle transaction, so inserting the crawl and its ledger rows is atomic.

`monitor.ts` adds a read-only query example. It uses Drizzle's `unionAll` to combine model and
endpoint changes, retains a numeric crawl-order expression for SQLite sorting, limits the result,
and returns Area 2's monitor-event shape through an `Effect`.

## Schema Mapping

`schema.ts` models the currently implemented Area 2 v2 tables with `sqliteTable`:

- `database_metadata`, `crawls`, `models`, and `endpoints`
- `model_changes` and `endpoint_changes`
- Area 2's foreign keys, composite keys, indexes, and check constraints

Area 2 stores document values as JSON text. Drizzle's
`text('state_json', { mode: 'json' }).$type<unknown>()` preserves that SQLite representation while
serializing and parsing values at the query boundary.

`sqliteTable` in Drizzle `1.0.0-rc.4` cannot express SQLite's `STRICT` table option. A production
migration must preserve Area 2's `STRICT` clauses with custom SQL or migration output; this
demonstration deliberately does not claim that the schema builder alone recreates that invariant.

## Sources

1. Drizzle Bun SQLite driver source, `v1.0.0-rc.4`: <https://github.com/drizzle-team/drizzle-orm/blob/v1.0.0-rc.4/drizzle-orm/src/bun-sqlite/driver.ts>
2. Drizzle Bun SQLite session and synchronous transaction implementation: <https://github.com/drizzle-team/drizzle-orm/blob/v1.0.0-rc.4/drizzle-orm/src/bun-sqlite/session.ts>
3. Bun SQLite API: <https://bun.com/docs/runtime/sqlite>
4. Vendored Effect Bun SQLite client lifecycle and writer serialization: [`repos/effect/packages/sql/sqlite-bun/src/SqliteClient.ts`](../../../../repos/effect/packages/sql/sqlite-bun/src/SqliteClient.ts)
5. Existing Area 2 SQLite schema: [`apps/labs/src/area-2/schema.ts`](../area-2/schema.ts)

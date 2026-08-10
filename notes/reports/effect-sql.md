# Effect SQL for the product projection

Effect SQL is a strong fit for the local SQLite executable specification and for product-shaped
reads. It does not make the Bun and D1 write paths interchangeable. ORCA should keep its own
projection-store and product-query contracts, then use Effect SQL inside their adapters.

This investigation uses the vendored Effect repository at commit
`bae409804c8c02c11e5c9143a317901518d95c1d` as its primary source. Both relevant adapters and the
shared SQL modules are Effect 4 beta APIs.

## What Effect SQL gives us

`@effect/sql-sqlite-bun` adapts `bun:sqlite` into both a Bun-specific `SqliteClient` and the generic
`SqlClient`. It enables WAL by default, serializes access to its single connection, supports normal
Effect SQL transactions, and adds database export and extension loading. It does not support
streaming query results or `updateValues`.
([source](../../repos/effect/packages/sql/sqlite-bun/src/SqliteClient.ts))

`@effect/sql-d1` adapts a Worker `D1Database` binding into the same generic `SqlClient`. It uses the
same SQLite statement compiler and adds a prepared-statement cache. It also lacks streaming and
`updateValues`.
([source](../../repos/effect/packages/sql/d1/src/D1Client.ts))

The useful common substrate is:

- parameterized tagged-template statements, escaped identifiers, multi-row `insert`, `in`, boolean
  fragments, and dialect selection;
  ([source](../../repos/effect/packages/effect/src/unstable/sql/Statement.ts))
- `SqlSchema` helpers that encode query inputs and decode unknown driver rows with Effect Schema;
  these suit the `ProductQueries` boundary particularly well;
  ([source](../../repos/effect/packages/effect/src/unstable/sql/SqlSchema.ts))
- layers and services for supplying the database implementation without plumbing it through every
  operation;
- SQL statement and transaction spans, with database attributes supplied by the drivers;
  ([source](../../repos/effect/packages/effect/src/unstable/sql/SqlClient.ts))
- `SqlResolver` batching for concurrent application requests. The D1 suite exercises ordered,
  grouped, and `findById` resolvers, although these solve an HTTP/read-side problem rather than an
  archive-replay problem.
  ([source](../../repos/effect/packages/sql/d1/test/Resolver.test.ts))

This is a meaningful improvement over hand-wrapping `bun:sqlite`: query inputs remain
parameterized, returned rows can be decoded at the boundary, client lifetime is scoped, and SQL
participates in the same logging/tracing model as the rest of the Effect application.

## The portability boundary

The immediate local requirement says that every crawl must commit atomically. The Bun adapter can
implement this directly with `SqlClient.withTransaction`; the shared implementation begins a real
transaction, commits or rolls back with the Effect exit, and uses savepoints for nested
transactions.
([source](../../repos/effect/packages/effect/src/unstable/sql/SqlClient.ts))

D1 is deliberately different. `D1Client.withTransaction` defects rather than executing a
transaction. Its adapter instead exposes a D1-specific `batch(statements)` operation which submits
a preconstructed collection of prepared statements as one atomic D1 batch and reports the results
in order. The adapter's tests verify rollback when a statement in a batch fails.
([implementation](../../repos/effect/packages/sql/d1/src/D1Client.ts),
[test](../../repos/effect/packages/sql/d1/test/Client.test.ts))

Therefore this would be a false abstraction:

```text
processor -> generic SqlClient -> swap Bun for D1
```

The durable seam should instead be:

```text
processor -> ProjectionStore.commitCrawl(plan)
                ├── Bun: execute statements inside withTransaction
                └── D1: construct and submit an atomic batch

products  -> ProductQueries
                ├── Bun SqlClient implementation
                └── D1 SqlClient implementation
```

The processor should finish computing a crawl's state changes and immutable events before it asks
the store to commit them. This keeps diff semantics independent of storage and gives each adapter
enough information to choose its own atomic mechanism. It also follows the existing objective that
SQLite is an executable specification rather than the production architecture.
([objectives](../objectives.md), [event contract](product-events.md))

The read side is substantially more portable. The proposed catalog, Monitor, Pricing History, and
live-crawl reads are ordinary SQLite queries and can share statement-building and result-decoding
modules across both adapters. Product code should still depend on `ProductQueries`, not on table
layout or `SqlClient`.
([query contracts](product-queries.md))

## What not to adopt yet

- **Do not expose generic `SqlClient` as the projection-store interface.** It cannot express the
  D1 atomic write mechanism without leaking driver capabilities back into the processor.
- **Do not use `SqlResolver` in historical replay.** Replay is an ordered single-writer process;
  resolver request batching and caching add machinery without solving its bottleneck. Reconsider it
  for concurrent product reads.
- **Do not treat Effect reactivity as a cross-request product delivery system.** The generic client
  delegates reactive queries to an in-process `Reactivity` service. Monitor and Alerts still need
  explicit new-crawl flow and durable delivery semantics.
- **Do not assume the shared migrator is portable to D1.** The Bun package exposes
  `SqliteMigrator`, but the shared migrator runs its work with `withTransaction`; the D1 package
  exports no migrator. Keep migration definitions comprehensible and shared where practical, while
  allowing platform-specific runners.
  ([Bun migrator](../../repos/effect/packages/sql/sqlite-bun/src/SqliteMigrator.ts),
  [shared migrator](../../repos/effect/packages/effect/src/unstable/sql/Migrator.ts),
  [D1 exports](../../repos/effect/packages/sql/d1/src/index.ts))

## Performance implications

Effect SQL will improve structure and observability, not automatically make the historical replay
faster. The Bun driver serializes all database access and materializes query results. That is
appropriate for a deterministic single-writer build, but it means concurrency is not a SQL
throughput strategy. Replay should continue to stream or bound artifact processing, construct one
crawl plan at a time, reuse set-based statements where possible, and avoid issuing one Effect per
individual field row when a multi-row insert is available.

The existing full-history replay is the benchmark. Before replacing its direct `bun:sqlite` writes,
compare:

- total replay time and time per crawl;
- SQL statement count and rows written per crawl;
- peak memory;
- terminal database digest and product-query results.

If the abstraction has measurable overhead, retain Effect SQL at the module and read boundaries and
make the Bun adapter's hot bulk-write operation deliberately deeper. The domain contract does not
require every row to pass through a tagged template separately.

D1 should serve active/current product projections, not receive the historical replay one crawl at
a time. A later D1 spike must prove that a realistic active crawl plan fits D1's operational limits
and that its atomic batch produces the same state as the Bun transaction.

## Maturity and dependency risks

The shared modules live under `effect/unstable/sql`, both adapters are versioned with Effect 4 beta,
and API churn is expected. The Bun adapter's own client test is currently only a no-op, while the D1
adapter has substantive Miniflare tests for statements, batches, rollback, transforms, and
resolvers.
([Bun test](../../repos/effect/packages/sql/sqlite-bun/test/Client.test.ts),
[D1 tests](../../repos/effect/packages/sql/d1/test/Client.test.ts))

ORCA therefore needs adapter contract tests of its own. The initial implementation pins Effect,
both platform packages, and both SQL adapters to beta.101. Labs declares
`@effect/sql-sqlite-bun` directly rather than relying on Alchemy's transitive SQL dependencies.

Error modeling does not need a design pass now. The Bun adapter classifies SQLite failures, whereas
the D1 adapter currently wraps native failures as `UnknownError`. The useful near-term behavior is
that both expose `SqlError` to the adapter; domain operations can add meaning only where a caller can
act on it.

## Recommended next slice

1. Add a small Labs projection package using `@effect/sql-sqlite-bun` against a disposable database.
2. Define `ProjectionStore.commitCrawl(plan)` and the existing four `ProductQueries` operations as
   Effect services. Keep generated state changes/events as data before persistence.
3. Implement schema setup or migrations, then one atomic Bun crawl commit using
   `withTransaction`.
4. Implement the four product-shaped reads with tagged templates and `SqlSchema` result decoding.
5. Port the existing golden replay cases and add store contract tests for atomic rollback,
   idempotence, null versus missing values, pagination, pricing availability periods, and
   deterministic rebuilds.
6. Benchmark the Effect SQL implementation against the current direct `bun:sqlite` replay before
   committing to its bulk-write shape.
7. Only then add a Miniflare D1 adapter spike: share the reads, translate one realistic crawl plan
   into `D1Client.batch`, and run the same contract tests. That experiment—not the common
   `SqlClient` type—decides whether D1 is a viable projection store.

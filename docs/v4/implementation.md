# V4 implementation conventions

## Code placement and table names

- Create all new V4 backend modules and files under `packages/backend/convex/v4/`.
- Prefix every V4 table name with `v4_`, for example `v4_ingestions` and `v4_entityRecords`.
- Module pages use short names for table definitions; register them under their prefixed Convex names.

The implementation builds on the existing `scan`, `projections`, `views`, `changeEvents` and `v3` code.
Catalog replaces the broader Views name. Organization within `convex/v4/` develops through implementation.

## Table-module convention

- Ingestion owns admission, sequencing and progress.
- Table-owning modules expose schemas, domain reads and validated prepared-row writers.
- Module ownership describes responsibility; ingestion ownership of output describes provenance.
- [Projections](projections.md) supplies pure derivation; callers perform storage access.
- Functions called within one mutation share its transaction. Calls across mutations have separate
  commit points.
- Module functions can compose directly within an action; distinct completion meanings allow
  independent runs without requiring separate top-level actions or scheduling hops.

```text
Ingestion → Scan + Projections → Records / Prices / Listings / Readings
    │                                       │
    └→ completion and process claims        └→ catalog, history and event reads
         ├→ Catalog: derive cache state, write changes
         └→ Change Events: interpret and publish claims
```

**Implementation recommendation:** start with ordinary exported append/reconcile/publish functions
and small colocated series modules. Settle exact arguments and private batching helpers in code;
a common TypeScript interface can follow demonstrated shared structure.

Exceptional data cleanup is targeted operational work when a concrete need arises.

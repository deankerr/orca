# V4 implementation conventions

## Code placement and table names

- Create all new V4 backend modules and files under `packages/backend/convex/v4/`.
- Scan extraction may use a separate file under shared `convex/scan/`; it owns unwrapping artifacts
  into entities independently of V3's product projections.
- Prefix every V4 table name with `v4_`, for example `v4_ingestions` and `v4_entityRecords`.
- Module pages use short names for table definitions; register them under their prefixed Convex names.

The implementation builds on the existing `scan`, `projections`, `views`, `changeEvents` and `v3` code.
Catalog replaces the broader Views name. Organization within `convex/v4/` develops through implementation.

[Implementation stages](stages.md) governs scope. Core refinement comes next; Events is fully
deferred, and `public_api/` is sealed until its late developer-guided compatibility stage.

## Table-module convention

- Ingestion owns admission, sequencing and progress.
- Table-owning modules expose schemas, domain reads and validated prepared-row writers.
- Module ownership describes responsibility; ingestion ownership of output describes provenance.
- Scan owns artifact extraction; [Projections](projections.md) supplies the shared product lens.
  Callers perform storage access and encode extensible JSON at persistence and function seams.
- Functions called within one mutation share its transaction. Calls across mutations have separate
  commit points.
- Module functions can compose directly within an action; distinct completion meanings allow
  independent runs without requiring separate top-level actions or scheduling hops.

```text
Ingestion → Scan + Projections → Records / Prices / Listings / Readings / Catalog
    │                                       │
    └→ completion and clock                 └→ current and historical product reads
```

**Implementation recommendation:** start with ordinary exported append/upsert functions
and small colocated series modules. Settle exact arguments and single-mutation boundaries in code;
a common TypeScript interface can follow demonstrated shared structure.

Keep one mutation per table while the relevant mutation set is being established. Review limits
holistically against actual data and production evidence afterward; speculative batching must not
change the intended transaction semantics. Events' future composition is deferred with its design.

Exceptional data cleanup is targeted operational work when a concrete need arises.

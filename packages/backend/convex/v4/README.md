# V4

Retained history derived from scan artifacts. V3 tables and runners stay in place.

⚠️ Catalog tables retain known entities permanently. Ingestion only inserts or overwrites rows;
endpoints become unlisted rather than deleted, and models/providers remain known after omission.

The contracts live in `docs/v4`. `docs/v4/stages.md` owns implementation gates and deferrals.
The next stage refines core data contracts to grid/pricing-history integration readiness.
Open choices are marked `ATTENTION`.

## Modules

| Path           | Owns                                                              |
| -------------- | ----------------------------------------------------------------- |
| `scan/`        | Load shared Scan artifacts and extract scoped entity observations |
| `projections/` | Shared product lens, comparison, and selected pricing             |
| `records/`     | Retained MEP values and contextual reads                          |
| `series/`      | Price, listing, and reading rows, plus model pricing history      |
| `ingestion/`   | Admission, the phase plan, and the forward run                    |
| `catalog/`     | Cumulative current-entity writes and product reads                |

Each module's `table.ts` defines its tables. `json.ts` encodes stable JSON for storage;
`scan/time.ts` owns capture-time validation and artifact naming.

- Extraction removes related endpoint bodies and renames its accessor to `provider_tag`.
- Retained entity JSON includes scan-derived extras; relationships remain typed record fields.
- Current rows store extensible facts in `metadata_json`; endpoint facts are grouped by owner.
- Pricing preserves the complete conditional-pricing array in `overrides_json`.

## Runners

- The existing `scan/action:run` owns capture; V4 consumes its stored artifacts.
- `v4/ingestion:run` ingests one ordinary pair, or an explicit `from_scan_at` / `scan_at`.
- Ingestion resumes its stored phase and completes after Catalog writes.
- Events design and implementation are fully deferred; the initial implementation has been removed.

V4 runners are not on the cron schedule. Scheduling and downstream handoff remain deferred.
Mutation-limit handling awaits a holistic review of the naive mutation set using actual data;
one mutation per table remains the intended starting point.

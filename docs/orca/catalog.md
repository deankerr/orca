# Catalog policy

Catalog retains current entity knowledge, sparse observations, complete price quotes, stats readings,
and Events. Each projection selects its own facts from extracted scans. Current-view metadata omission
lists do not constrain Events or source captures; alert eligibility does not constrain retention.

## Current facts

Current rows preserve last-known facts when an entity disappears. A newer observation replaces its
selected facts, including removal of fields no longer supplied. Metadata selection lives with the
current entity projections in `ingestion/`; changing it affects only rows written afterwards.

| Date            | Meaning                                               |
| --------------- | ----------------------------------------------------- |
| `scan_at`       | Scan at which the retained entity state was assessed. |
| `or_created_at` | Upstream creation time.                               |
| `unlisted_at`   | Endpoint disappearance; relisting clears it.          |

For a pair A → B, every projected row uses B's `scan_at`, including departures whose last-known
facts come from A. Current rows use this timestamp alone to reject older or equal writes.
Events record changes; `scan_at` does not establish when an entity's facts last changed.

- Model and provider presence means serving: each exists in a scan only through its listed endpoints.
- Endpoint unlisting retains its facts and records the disappearance scan in both `scan_at` and `unlisted_at`.
- Grid includes listed endpoints and a recent-unlisting window, configured in `config.md`.
- Older rows remain available to entity and history queries.

### Current stats

Current stats replace the default-tier snapshot only for a newer scan. Missing, negative, or nonfinite
readings are omitted.

Snapshot capacity is 1 MiB or 8,192 rows in one document. Reassess sharding as usage approaches either limit.

- 🔭 2026-10-14 prod `v4_current_stats_snapshot`: 121,309 Convex bytes / 1,253 rows (11.6% / 15.3% of limits).

## Observation history

`catalog_observations` establishes baseline states and records changes to these facts:

| Entity   | Retained state                                |
| -------- | --------------------------------------------- |
| Model    | Endpoint count; zero means absent.            |
| Provider | Endpoint count; zero means absent.            |
| Endpoint | Detection, model, provider, and provider tag. |

- Counts use distinct endpoint identities; replacing endpoints without changing a parent's count adds no parent row.
- Unchanged states produce no row; reappearance records a new state even when it matches a prior episode.
- Departures retain zero counts or non-detection; endpoint departures keep their last relationship context.
- Missing pre-baseline history is unknown.
- Observation rows contain no metadata snapshot.
- Parent rows keep the earlier scan's count, so lifecycle alerts need no other pair's rows; baseline rows have none (`null`).

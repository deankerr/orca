# Catalog policy

Catalog retains current entity knowledge, sparse observations, complete price quotes, stats readings,
and Events. Each projection selects its own facts from extracted scans. Current-view metadata omission
lists do not constrain Events or source captures; alert eligibility does not constrain retention.

## Current facts

Current rows preserve last-known facts when an entity disappears. A newer observation replaces its
selected facts, including removal of fields no longer supplied. Metadata selection lives with the
current entity projections in `ingestion/`; changing it requires explicit refresh of existing rows.

| Date            | Meaning                                               |
| --------------- | ----------------------------------------------------- |
| `scan_at`       | Scan at which the retained entity state was assessed. |
| `or_created_at` | Upstream creation time.                               |
| `unlisted_at`   | Endpoint disappearance; relisting clears it.          |

For a pair A → B, every projected row uses B's `scan_at`, including departures whose last-known
facts come from A. Current rows use this timestamp alone to reject older or equal writes.
Events record changes; `scan_at` does not establish when an entity's facts last changed.

- Model/provider record presence does not establish serving availability.
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

| Entity   | Retained state                                                             |
| -------- | -------------------------------------------------------------------------- |
| Model    | Detection and endpoint count, including detected models with no endpoints. |
| Provider | Endpoint count; provider observation is derived from endpoint presence.    |
| Endpoint | Detection, model, provider, and provider tag.                              |

- Counts use distinct endpoint identities; replacing endpoints without changing a parent's count adds no parent row.
- Unchanged states produce no row; reappearance records a new state even when it matches a prior episode.
- Departures retain zero counts or non-detection; endpoint departures keep their last relationship context.
- Missing pre-baseline history is unknown.
- Observation rows contain no metadata snapshot.

## Current-view refresh

Refresh rebuilds one retained entity with the current projection rules.

- Preserve identity and endpoint availability.
- Leave histories, Events, ingestion progress, and delivery untouched.
- Use the assessed scan's date even when retained facts are unchanged.

### Source selection

The entity's latest observation through the completed horizon selects its source:

- A detected model or endpoint uses the horizon's capture; a provider does so when its endpoint count is positive.
- A departed entity uses the predecessor capture recorded by its departure registration.
- Sparse observation dates are transitions, not last-seen dates; subtracting an assumed scan interval is incorrect.

This also locates departed endpointless models without searching intervening captures.

- Missing source captures or entities fail explicitly.
- Rows ahead of the completed horizon must wait.
- A concurrent row change aborts replacement; retry the entity.

### Operator commands

Run from `packages/backend` against the intended deployment:

```sh
bunx convex run ingestion/refresh:refreshCurrentEntity '{"entity_kind":"model","entity_id":"author/model"}' --deployment <deployment>
```

For bulk refresh, page `ingestion/refresh:targets` with `entity_kind` and `paginationOpts`, then refresh
those targets individually.

- Each refresh loads a complete source capture.
- Keep projection rules stable throughout the operation; rerun if the rules change.

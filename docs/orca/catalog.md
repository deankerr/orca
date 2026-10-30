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
- Grid hides an unlisting once it is older than the endpoint was at unlisting, aged from upstream `created_at`.
- That age cap is a coarse noise filter; rows without `created_at` cannot be aged and remain for the whole window.
- 🔭 2026-10-27 prod, 221 windowed unlistings: `created_at` never followed first observation; 142 were within 1 day.
- Older rows remain available to entity and history queries.

Ingestion never rewrites an unlisted row, so a metadata selection change reaches existing unlistings only
through a restatement. It rederives each row from the scan before its unlisting, newest unlisting first:

```sh
bunx convex run ingestion/catalog/refreshUnlistedEndpoints:run '{"atOrAfter":"<iso-time>"}' --deployment <deployment>
```

It runs in scheduled pages of 100 rows and logs `Refreshed unlisted endpoints` with rows read and restated, plus
endpoint IDs absent from their source scan. Rows relisted or unlisted again since the read are skipped.

Ingestion compares both sides of a pair under the current selection, so a selection change alone never rewrites a
listed row either. A separate restatement rederives listed endpoints from the latest scan with committed output:

```sh
bunx convex run ingestion/catalog/refreshListedEndpoints:run --deployment <deployment>
```

It logs `Refreshed listed endpoints` the same way. Rows unlisted, or ingested past that scan, since the read are
skipped. Listed endpoints absent from the scan are reported, and left for ingestion.

Models have the same restatement. Models absent from the scan keep their last-known row and are counted as `absent`:

```sh
bunx convex run ingestion/catalog/refreshModels:run --deployment <deployment>
```

Providers have no restatement.

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

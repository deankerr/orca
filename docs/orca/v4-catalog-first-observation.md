# Catalog first observation

`from_scan_at` on V4 models, providers and endpoints is the first scan where this deployment's
retained timeline observed that exact identity. It is not the upstream creation date, document
`_creationTime`, current listing period, or the predecessor scan of an ingestion pair.

Initialization sets it to the baseline scan. A newly inserted identity gets its observation's
`scan_at`; routine replacements preserve the stored value through updates, departures, relationship
changes and reappearances. Existing rows without a value stay unset: updating a legacy row does not
prove when it was first observed. Scan projections do not carry the field, so it cannot create diffs.

Model arrival classification prefers `from_scan_at` when present, while retaining earlier Listings
evidence and the existing Catalog `scan_at` fallback for unbackfilled models. The fallback's documented
historical-model limitation remains until those rows are backfilled. Stored events are not rewritten.

## Completed one-off backfill

The one-off backfill is complete and its runner has been removed. It used the earliest retained
ingestion's `from_scan_at` as its baseline, with the same scoped scan extraction as routine ingestion.

Dates were selected as follows:

- **Endpoints:** earliest `by_endpoint_id_and_scan_at` Listings record.
- **Providers:** earliest `by_provider_id_and_scan_at` Listings record.
- **Models in the baseline:** the baseline scan timestamp.
- **Other models:** earliest `by_model_id_and_scan_at` Listings record, or an earlier explicitly
  verified historical-model observation from the mapping below.

### Accepted limitations

Listings history is assumed complete. For models, first endpoint listing can follow first catalog
appearance. This approximation is accepted for this backfill; exact reconstruction would require
reading intermediate source artifacts. No upstream creation dates or sibling variant dates are used.

The production audit found 1,013 models: 483 baseline, 513 additional Listings matches, 11 verified
historical standard identities, and six unresolved routing identities. Those routing IDs are
`openrouter/auto-beta`, `openrouter/bodybuilder`, `openrouter/free`, `openrouter/fusion`,
`openrouter/pareto-code` and `typesafe/jev-router`. They stay unset; filtering/removing routing models
is separate work. Counts may change as ingestion continues.

### Verified historical standard identities

Each following standard ID was absent in the scan immediately preceding its free variant's first
loss of all endpoints, and present in the listed scan. The scanner assigns the bare slug and
`variant: 'standard'` when the upstream catalog entry has `endpoint: null`.

| Standard model ID                 | Verified observation (`scan.<timestamp>.jsonl`) |
| --------------------------------- | ----------------------------------------------- |
| `baidu/cobuddy`                   | `2026-05-27T14:50:00.123Z`                      |
| `dots-studio/dots-3-note-preview` | `2026-08-14T06:30:04.081Z`                      |
| `featherless/qwerky-72b`          | `2025-08-26T13:12:23.268Z`                      |
| `google/gemini-2.0-flash-exp`     | `2026-01-29T16:50:00.306Z`                      |
| `google/gemma-3n-e2b-it`          | `2026-05-05T20:50:00.128Z`                      |
| `inclusionai/ling-3.0-tiny`       | `2026-08-13T07:30:04.445Z`                      |
| `liquid/lfm-2.5-1.2b-instruct`    | `2026-07-13T14:50:00.209Z`                      |
| `liquid/lfm-2.5-1.2b-thinking`    | `2026-07-13T14:50:00.209Z`                      |
| `liquid/lfm-2.5-2.6b`             | `2026-08-12T18:30:04.164Z`                      |
| `qwen/qwen3.6-plus-preview`       | `2026-04-03T00:50:00.124Z`                      |
| `sarvamai/sarvam-m`               | `2025-09-02T15:11:38.534Z`                      |

These are exact-ID observations, not the earlier discovery of their free variants. The small
mapping is deliberately specific to the audited history; other unresolved IDs remain unset.

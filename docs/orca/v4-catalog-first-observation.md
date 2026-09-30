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

## One-off backfill

No production backfill has been run. Deploy the optional fields and the preserving routine writer
before applying the backfill. The runner uses the earliest retained ingestion's `from_scan_at` as
its baseline and loads that artifact with the same scoped extraction as routine ingestion.

Dates are selected as follows:

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

### Operation

From `packages/backend`, first deploy the code to the intended deployment. Run a dry run (the default):

```sh
bunx convex run --deployment <deployment-name> v4/catalog/backfill:run '{}'
```

The result reports the baseline and, per table, examined rows, existing dates, valid candidates by
source, patched rows, and unresolved/invalid records. Candidates before the deployment baseline or
after their Catalog row's `scan_at` are invalid and remain untouched. Review all issues before applying.
`v4/catalog/backfill:batch` also returns individual proposed dates for a supplied page.

After reviewing the dry run, apply explicitly:

```sh
bunx convex run --deployment <deployment-name> v4/catalog/backfill:run '{"apply":true}'
```

The action drives bounded 50-row transactions and returns totals for the entire run. It only patches
missing `from_scan_at` values. Each transaction reads the current row before patching; concurrent
routine ingestion preserves the value through Convex transaction retries. No events, work, current
facts, observation clocks or Discord deliveries are changed.

If interrupted, restart the same command: populated values are preserved. Run another dry run after
applying; expect no remaining valid candidates, only existing dates and reviewed unresolved/invalid
records. Compare examined row counts before and after, accounting for live ingestion. Keep the field
optional. A timeout can leave completed batches applied; it does not roll them back.

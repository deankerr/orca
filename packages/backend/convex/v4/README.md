# V4

Catalog retains cumulative entity knowledge; Pricing and Listings retain observation history;
current Stats publishes the latest endpoint readings.

## Design invariants

- Top-level composition selects inputs and makes fan-out, transaction grouping, failure handling
  and continuation explicit. Modules own projection and persistence; composition imports their
  phase files directly.
- Load each pair once and share the observations across initialization, Catalog, History and Stats.
  Pass prepared payloads across Convex mutation boundaries. [Objects](../objects/README.md) owns
  source selection and compressed transfer.
- Commit Models, Providers, Endpoints, the ingestion record and Pricing/Listings obligations in
  one transaction. Acceptance advances the shared observation clock in `clock.ts`.
- Commit each History payload and its work completion together, including empty output. Validate
  both pair times against the obligation's ingestion. Completed work is idempotent.
- Await Pricing, Listings and Stats independently after acceptance, then schedule continuation.
  Failed History attempts remain pending for manual retry. An interrupted routine resumes from
  the clock on the next cron/manual run.
- Stats publishes its snapshot and cursor atomically. Newer publications supersede older attempts;
  failure retains the previous snapshot, and recovery selects the latest ingested observation.
- History query cutoffs bound observation time. Pending work can leave gaps below that cutoff.
  Catalog, History and Stats may become visible at different times.

## Observation semantics

- `scan_at` dates ORCA's observation. Baseline rows establish the first retained knowledge.
- Catalog retains departed entities' last-known facts. The grid includes listed endpoints and
  endpoints unlisted within 30 days of the shared clock. Listed baseline rows are immediately readable.
- Keep model/provider metadata with its owning entity and
  [provider labels endpoint-local](../../../../docs/orca/provider-identity.md).
- Pricing carries through continuous availability; reappearance supplies a fresh quote. Historical
  windows need entering prices and listings. The grid omits zero prices; History preserves them.
- Scan scopes observations to text input/output and discards endpoint `status`. Consumers validate
  required facts; malformed optional facts may become unknown.
- Catalog canonicalizes metadata string-array order; pricing override order is preserved.
- Stats history is dormant.

## Initialization and recovery

A fresh timeline initializes from the previous observation of its first selected pair, one table
mutation at a time, then processes that pair. Partial initialization requires investigation/reset
before restarting.

`start_at` requires a fresh timeline and accepts an ISO date or timezone-qualified timestamp.
The first capture at or after it becomes the baseline. Omit it to resume from the shared clock.

Run from `packages/backend`, selecting the deployment explicitly:

```sh
bunx convex run --deployment dev v4/routine:run '{"start_at":"2026-09-20"}'
```

| Operation             | Function                                  | Arguments                                                                                   |
| --------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| Resume ingestion      | `v4/routine:run`                          | `{}`                                                                                        |
| Inspect pending work  | `v4/ingestion/progress:listProcessorWork` | `{"processor":"pricing","state":"pending","paginationOpts":{"numItems":100,"cursor":null}}` |
| Retry one obligation  | `v4/retry:pricing` / `v4/retry:listings`  | `{"work_id":"…"}`                                                                           |
| Refresh current Stats | `v4/refreshStats:run`                     | `{}`                                                                                        |

`ORCA_V4_INGEST_CRON_ENABLED=true` admits new hourly cron starts. Existing continuation chains
and manual runs proceed independently of the flag.

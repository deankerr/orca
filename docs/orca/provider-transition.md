# Provider identity transition

Planning state: extraction is verified in an isolated dev deployment. Production
transition code and the `first_scan_at` rename are not implemented. Historical
Monitor/Feed events will be regenerated under the new provider model. A maintenance
window is acceptable once rehearsal measures its duration. The extraction policy
lives in `docs/orca/provider-identity.md`.

## Why a deployment is insufficient

Ingestion compares two scans using the same extraction and writes only their
differences. Deploying the new extraction therefore leaves unchanged stored endpoint
relationships, provider metadata, and retired aliases untouched. Previously accepted
pairs are skipped by `ingestion/release.ts`; routine ingestion cannot rebuild them.

Provider events require regeneration from captures. Renaming their keys would retain
false arrivals/departures, conflicting simultaneous events, and changes to omitted
metadata. Endpoint events also contain provider identities in context and serialized
changes. The original baseline and accepted predecessor/next pairs must be preserved
so this change does not silently redefine the observed timeline.

## Affected data and consumers

| Surface                                         | Required treatment                                                                                                                                                                           |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `v4_providers`                                  | Rebuild canonical identities and cleaned metadata, including departed providers. Select metadata from complete scan observations, not independently merged old rows.                         |
| `v4_endpoints`                                  | Normalize every stored provider relationship, including long-unlisted endpoints. Preserve UUIDs, tags, endpoint labels, listing state, and endpoint-owned facts.                             |
| `v4_models`                                     | Rename the first-observation field. Provider normalization does not change model identity or facts. Replay also needs model knowledge for arrival classification.                            |
| `v4_endpoint_listing_history`                   | Regenerate relationships and transitions under canonical providers; alias-only relationship transitions can disappear. Preserve real tag and listing changes.                                |
| `v4_events`                                     | Regenerate provider and endpoint events, captured context, serialized changes, and arrival classification. Verify model events remain semantically unchanged.                                |
| Catalog queries, Grid, overviews, Monitor, Feed | Read mutually consistent catalog, listings, and events. Catalog return validators derive from table validators, so the timestamp rename also changes their returned shape.                   |
| Discord                                         | Suppress historical delivery and settle queued work referencing old event IDs before replacement. Previously delivered messages remain unchanged.                                            |
| Provider filters, links, caches, cursors        | Old alias filters may cease to resolve; event addresses can merge/disappear. Restart history pagination and invalidate persisted query results at cutover. Keep normalization in extraction. |

Endpoint pricing history, endpoint stats history, and the current stats snapshot use
UUIDs and need no identity conversion. Preserve their contents and coverage. Raw
Objects and the frozen V2 API/cache remain independent of the new extraction.
Ingestion pairs remain the timeline authority; their ledger and processor work must
agree with the rebuilt output at the cutover horizon.

This is a code-derived scope, not a completed production inventory. Deployed legacy
tables, record counts, raw-capture coverage, pending work, and replacement duration
still need measurement.

## First-observation naming correction

Rename `from_scan_at` to `first_scan_at` only on models, providers, and endpoints.
The field remains optional: absence means unknown. A naming migration copies the
existing value exactly, including absence; `scan_at` and Convex `_creationTime`
cannot supply missing evidence.

Update the three catalog writers and initializers, the model fallback in
`events/ingest.ts`, lifecycle tests, inferred query contracts, and CONTEXT. Keep
`from_scan_at` in ingestion records, scan-pair arguments, processor work inputs, and
their indexes: it still identifies the before scan.

For populated tables, stage compatible validators/readers before copying values,
switch writers to `first_scan_at`, then remove the old property and compatibility
after verification. Keep this mechanical rename separate from provider merging.
Merging providers changes the identity whose first observation is being dated:
derive that date from covered scan history. The earliest known alias date alone is
insufficient when other aliases have unknown earlier history. Any recovery of missing
dates beyond the naming copy must be identified and verified separately.

## Proposed execution sequence

1. Inventory a fixed production horizon: baseline, accepted scan pairs, table counts,
   provider merges, missing first-observation dates, pending processors, and scheduled
   ingestion/retry/delivery work. Verify every required raw capture is readable.
   Retained facts outside replay coverage require an explicit preservation decision.
2. Rehearse the naming migration and historical reconstruction on isolated data.
   Use bounded, resumable replay with its own checkpoint; the live ingestion ledger
   must neither skip reconstruction nor advance because of it. Rebuild chronological
   knowledge before classifying arrivals. Keep all outbound delivery disabled.
3. Compare old and rebuilt projections at the same horizon. Account for each provider
   merge and event change. Measure replay and replacement duration, interruption and
   retry behavior, and rollback using a snapshot of the original data/code. Rollback
   must restore a consistent derived timeline without rewinding raw collection.
4. Prepare maintenance handling for the affected web and Feed reads, compatible
   schemas, and resumable replacement across catalog, listings, and events. Stage
   reconstructed output before the window; keep partial replacements hidden until
   the complete result passes verification. Existing V2 reads remain independent.
5. Stop admitting ingestion and settle/cancel existing continuations and retries at
   a recorded horizon. `ORCA_INGESTION_CRON_ENABLED=false` only gates cron admission;
   manual runs and scheduled continuations bypass it. Bring reconstruction through
   that exact horizon, settle event work, and prevent stale writers from committing.
   Raw collection can continue independently.
6. Replace verified projections, refresh client caches, and resume ingestion
   from the preserved horizon. Suppress catch-up broadcasts; enable live delivery
   only after the backlog and stale delivery jobs are settled. Retain rollback data
   through validation; production execution is a separate reviewed step.

## Acceptance evidence

- One catalog row per canonical provider, with no retired alias rows or dangling
  provider references in endpoints, listings, event context, or event payloads.
- Provider metadata satisfies the omit policy across active and departed records.
- Endpoint/model identities, endpoint tags and labels, current listing state,
  pricing, and performance histories retain their intended facts and coverage.
- Known first-observation dates survive the naming copy exactly; unknown dates stay
  unknown unless separately justified by reconstruction evidence.
- Events contain no alias-only provider lifecycle or relationship changes; genuine
  transitions remain, and `previously_known` uses strictly earlier reconstructed facts.
- Baseline and accepted pair sequence are unchanged; replay is resumable and repeatable,
  pending work is accounted for, and the next normal ingestion succeeds once.
- Grid, provider overviews, Monitor filters, and Feed agree at the cutover horizon;
  history pagination restarts correctly and reconstruction sends no Discord messages.

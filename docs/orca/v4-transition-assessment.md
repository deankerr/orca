# V4 product transition assessment

Assessed on 2026-09-27 local time (2026-09-26 UTC), against production
`dependable-husky-550` and checkout `457dbcc25`.
Production access was read-only. No V3 pull was run.

## Integration outcome

- **Grid:** uses V4 Catalog and Stats queries; catalog parity and stats publication are verified.
- **Entity Overview:** uses V4 queries and the `or_created_at` field; metadata matches for shared entities.
- **Pricing History:** uses historical endpoint discovery, complete per-endpoint listings, reactive
  price pagination, and model-specific traces with a separately subscribed chart horizon.
- **Dev data:** the worktree backend is deployed and a short V4 replay is verified;
  the procedure and concrete Pricing History examples are documented below.

## Production deployment and processing

The deployment audit identifies these releases on 2026-09-26 UTC:

| Time     | Commit    | Change                                            |
| -------- | --------- | ------------------------------------------------- |
| 14:53:07 | `8ad1909` | Cron entry points and migration-tool retirement   |
| 14:55:42 | `f47af90` | Source-aware scan loading and selectable baseline |
| 14:58:12 | `ccc7745` | Explicit composition and shared scan-pair loading |
| 15:00:11 | `457dbcc` | Singleton current-stats snapshot                  |

The initial parity capture at approximately 15:31 UTC preceded the next hourly capture:

| Check                   | Result                                                                    |
| ----------------------- | ------------------------------------------------------------------------- |
| Latest source scan      | `2026-09-26T14:40:04.074Z`                                                |
| V3 clock                | Same scan                                                                 |
| V4 clock                | Same scan                                                                 |
| V4 retained baseline    | `2025-08-13T20:19:21.211Z`                                                |
| V4 ingestions           | 9,780; no breaks between successive `scan_at` / `from_scan_at` pairs      |
| Processor work          | 9,780 pricing and 9,780 listings obligations, all complete                |
| Obligation pairing      | Exactly one pricing and one listings obligation per represented ingestion |
| Pending work            | Zero for pricing, listings, and dormant stats history                     |
| Recent hourly operation | 22 ingestions; acceptance 217.6–219.9 seconds after observation           |
| Cron configuration      | Capture, V3 ingestion, and V4 ingestion enabled                           |

The complete ingestion and work-table reads were bounded and confirmed untruncated. Continuity
checks establish continuity of retained pairs, not an independent audit of every historical capture.

### Runtime evidence

Axiom's 72-hour window ending at 15:35 UTC contains one V4 failure: `v4/backfill:run` encountered
an R2 TLS connection close at `2026-09-25T15:22:17.219Z`, request `49d159675d5c1183`.
The backfill subsequently advanced beyond the affected July 2026 scan and reached the current
clock. No other V4 execution failures or error-level console logs appeared in that window.
The old routine recorded 22 successful catalog commits, processor executions, and stats refreshes.

[Convex insights](https://dashboard.convex.dev/d/dependable-husky-550?view=insights) reported no
72-hour OCC/resource-limit findings. This is separate from the execution-failure check.

The releases at 14:58 and 15:00 occurred **after** the initial capture's last ingestion. Those 22
successful cycles exercised the previous implementation. The new routine was then observed live
at its first scheduled admission at 15:43 UTC.

### Stats publication at the initial capture

`v4/catalog/stats/query:grid` returned `{ as_of: null, rows: [] }`; the new
`v4_current_stats_snapshot` table was empty. The retired `v4_current_stats` table still contained
1,210 readings, matching V3 values exactly for the shared endpoints. V3 had 1,212 readings;
the two additional readings belong to the deliberately excluded Lyria endpoints.

This was an uninitialized new publication, resolved by the next scheduled cycle below.
`v4/refreshStats:run` remains the existing recovery operation if needed; it was not invoked
on production during this assessment.

Old cursor rows and the retired stats table remain in production. The new shared clock and
processor obligations are authoritative; old pricing/listings cursor values are not evidence
that current processing is stuck.

### First post-refactor cycle: passed

The 15:43 cron processed `2026-09-26T15:40:04.139Z`, request `5744454527a9c6ae`:

- Catalog committed seven changed endpoints; pricing inserted five rows.
- Listings committed zero rows and still completed its obligation.
- Stats published 1,218 readings in one snapshot document, writing about 118 KB.
- The routine completed successfully in 2.289 seconds; its continuation found no further pair
  and completed successfully in 61 ms.
- The new ingestion links to the previous clock, bringing the observed timeline to 9,781 pairs
  and 19,562 completed obligations. Both new obligations are complete; no pricing/listings work
  remains pending.
- At 15:44:21 UTC, V3 and V4 stats shared `as_of = 2026-09-26T15:40:04.139Z`.
  All 1,218 V4 readings match V3 exactly. V3's two extra readings are still the Lyria endpoints.

This verifies one normal cycle of the new composition and snapshot writer. Recovery, partial
initialization, overlapping runs, and processor-failure paths remain outside this live check.

## Product data parity

### Grid

Compared the actual production results of `v3/public/endpoints:list` and
`v4/catalog/endpoints/query:grid`, joining by endpoint UUID and ignoring system IDs/times and
string-array ordering.

| Measure                     |    V3 |    V4 |
| --------------------------- | ----: | ----: |
| Grid endpoints              | 1,550 | 1,548 |
| Listed endpoints            | 1,374 | 1,372 |
| Recently unlisted endpoints |   176 |   176 |

All 1,548 shared endpoints match on prices, identity relationships, availability, capabilities,
quantization, context/output limits, modalities, and data policies. Differences are:

- V4 excludes `google/lyria-3-clip-preview` and `google/lyria-3-pro-preview` explicitly in Scan.
- Nine endpoint provider labels differ because V4 uses endpoint-local `provider_display_name`;
  for example, `DeepInfra (bf16)` instead of `DeepInfra`. This follows the
  [provider ownership rule](provider-identity.md).
- One departed Ling endpoint retains `Ling-3.0-flash`, the name at its last observation,
  rather than V3's later `Ling 3.0 Flash`. Its UUID is
  `b71da21b-c617-4d58-9afa-0985df7716bf`, unlisted on August 28. Both current model records agree.
- V4 additionally exposes row `scan_at`; it is not the overall freshness clock.

### Entity Overview

Compared all retained model/provider rows using the checkout's V3/V4 product parsers:

- All 158 providers exist in both versions and match on overview fields.
- All 1,006 shared models match on overview metadata, names, modalities, and creation instants.
  V4 normalizes 104 differently formatted creation timestamps to ISO milliseconds.
- V3 has the two Lyria models; V4 additionally retains `openai/text-embedding-3-large` from a
  historical observation with both `embeddings` and `text` outputs. Its endpoint was unlisted
  in November 2025 and is outside the Grid window.

These overview comparisons used stored production rows and local parsers, rather than calling
every public overview query individually.

### Pricing History

Fetched full, paginated V4 histories at a fixed cutoff and compared with V3's complete model
query for five models:

| Model                        | V3 / V4 endpoints | V3 / V4 price rows | V3 / V4 listing rows |
| ---------------------------- | ----------------: | -----------------: | -------------------: |
| `openai/gpt-4o`              |             2 / 2 |              8 / 8 |                2 / 2 |
| `anthropic/claude-sonnet-4`  |             6 / 6 |            36 / 36 |              14 / 15 |
| `deepseek/deepseek-r1`       |           13 / 13 |            38 / 38 |              25 / 26 |
| `openai/gpt-oss-120b`        |           43 / 43 |          243 / 243 |             80 / 101 |
| `inclusionai/ling-3.0-flash` |             3 / 4 |            10 / 11 |                6 / 9 |

All 335 V3 price rows match V4 on observation time and the complete meters object. All V3
availability rows are present in V4. The additional rows reflect contextual listing changes
and one historically associated endpoint. This is a five-model history sample, not a complete
comparison of every retained price or of discounts/overrides.

#### Historical context requirements

V4 emits `listed` rows for a model, provider, or tag change during continuous availability,
without necessarily emitting another price. The chart carries quotes through these changes.

For endpoint `85835306-dba3-4334-87bc-ab9ffa5c9c62` (`openai/gpt-oss-120b`):

- The tag changes from `deepinfra/fp4` to `deepinfra/bf16` at `2026-03-10T20:50:00.361Z`.
- Its previous quote remains valid; the next price row is `2026-07-01T01:50:00.303Z`.
- The chart retains pricing throughout that interval under the historical `deepinfra/bf16` tag.

An actual unlisting ends availability and requires a fresh quote on reappearance.

Historical discovery also matters: UUID `17cceeaa-1077-450c-bc3f-a1b0a5e7592d` belonged briefly
to `inclusionai/ling-3.0-flash` before moving to its `:free` variant. V4's listing-history
`byModel` query finds it; selecting endpoints solely by their current model does not.
Its spans must be restricted to the requested model's historical membership.

## Product integration

Grid consumes V4 endpoint rows and the Stats envelope (`rows`, `as_of`); unlisted endpoints have
no current stats. Stats retains its own observation time independently of the Catalog clock.
Entity Overview and Pricing History's identity query use `model_id` / `provider_id` arguments;
the model creation field is `or_created_at`.

Pricing History discovers historical endpoint UUIDs, loads complete per-endpoint listings and
reactive price pages, and assembles model-specific traces through a separately subscribed horizon.
The horizon bounds observation time without promising processor completeness.

Browser checks verified 1,385 Grid rows, search, price sorting, model/provider panels, and the
13-endpoint Gone filter with blank stats. Pricing History checks covered the Morph tag change and
Prime Intellect availability gap. Unit checks cover model moves, quote carry-forward, missing/zero
meters, sampling boundaries, and reader contracts. See [Pricing History](v4-pricing-history.md)
for retrieval verification and known limitations.
Monitor uses the legacy `monitor`, `models`, and `providers` queries. These product changes alone
do not satisfy the separate V3/legacy removal, Events, deployment sync, or public API objectives.

## Worktree deployment

- Installed dependencies with the frozen lockfile and deployed checkout `457dbcc25` to
  [`reliable-swan-376`](https://dashboard.convex.dev/d/reliable-swan-376), reference
  `deankerr:orca-b8162:dev/v4-transition-77de`, expiring after seven days.
- Initially confirmed V3/V4 ingestions and local object locators were empty; no V3 pull was run.
- V3 capture/ingestion flags are false; V4 cron admission is unset and therefore disabled.
- Source authentication was initially unconfigured. After the environment was configured, remote
  discovery and replay succeeded with production as the dev read source.
- The verified replay begins at `2026-09-25T00:40:04.073Z` and reaches
  `2026-09-26T15:40:04.139Z`: 39 pairs, 78 completed obligations, no pending work, and current Grid
  and Stats parity with production. V3 and local object locators remain empty.
- This setup used a dev deployment and did not invoke preview initialization.
  `convex/init.ts` schedules V4 with a rolling two-day baseline for fresh previews
  and resumes existing timelines. Broader deployment sync remains unfinished.

Follow [V4 development data](v4-development-data.md) to repeat the setup. The
[Pricing History demo notes](v4-pricing-history.md) record the observed listing cases, the
client-side join requirements, and the backend product-interface questions that remain open.

## Repeatable read-only checks

Run from the repository root with the deployment explicit:

```sh
bun run --cwd packages/backend convex function-spec --deployment dependable-husky-550
bun run --cwd packages/backend convex insights --deployment dependable-husky-550 --details --json
bun run --cwd packages/backend convex run --deployment dependable-husky-550 v4/clock:get '{}'
bun run --cwd packages/backend convex run --deployment dependable-husky-550 v4/catalog/stats/query:grid '{}'
bun run --cwd packages/backend convex run --deployment dependable-husky-550 \
  v4/ingestion/progress:listProcessorWork \
  '{"processor":"pricing","state":"pending","paginationOpts":{"numItems":100,"cursor":null}}'
```

Repeat the pending-work query with `processor: "listings"`. Runtime evidence is in Axiom dataset
`orca`, scoped by `convex.deployment_name`, using `data.function.path`, `data.status`, and
`data.log_level`; deployment releases are `data.topic == "audit_log"`.

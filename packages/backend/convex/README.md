# Backend

Catalog owns cumulative entity knowledge and current endpoint stats; Pricing, Listings and Events
retain observation history. Current stats live in `catalog/stats/` with separate storage
to avoid rewriting endpoint documents whenever readings change.

`events/` produces base entity events. [`alerts/`](../../../docs/events/renderers.md) owns
shared reading and preparation, with product-led Monitor, Feed and Discord output modules.

## Module ownership

- Root `routine.ts`, `initialize.ts` and `retry.ts` compose work across domains. `clock.ts`
  supplies the shared observation horizon.
- `scan/` loads `Scan` and `ScanPair`, concealing extraction. Root `entities.ts` defines ORCA's
  `Model`, `Endpoint` and `Provider` schemas and their `normalize*` functions. Catalog projects
  these entities into stored rows; Events compares them and captures them in lifecycle payloads.
- `entities.ts` also defines normalized `Pricing`, `normalizePricing` and its storage encoding.
  Catalog, price history and Events share the same price interpretation; `history/pricing/` owns
  tracking and querying price changes over time.
- Shared helpers such as `json.ts`, `fields.ts`, `numbers.ts` and `entityLogo.ts` may live at
  the root. `priceMeters.ts` defines price units and decimal scaling; products own presentation.
- `alerts/shared/` owns alert interpretation and policy. Product-specific helpers stay with
  Monitor, Feed or Discord.
- `scan/collected.ts` describes collected entries with `IdentifiedModel`, `IdentifiedEndpoint`,
  `ScanEntry` and `RawScan`; the collector and scan storage share this format.
- `scan/schema.ts` describes loader results: `ScannedModel`, `ScannedEndpoint`, `ScannedProvider`,
  `Scan` and `ScanPair`. These guarantee identities and relationships while retaining source JSON.
  Consumers validate the additional fields they need; Stats and Listings do not require entity normalization.
- Normalization's `ModelInput`, `EndpointInput`, `ProviderInput` and `PricingInput` validators
  stay private to their modules, as does extraction's `ProviderBody`. The frozen public API
  uses `scan.loadRaw()` to retain full modality coverage and embedded provider fields.
- `ScanTimes` identifies a pair by `from_scan_at` and `scan_at` without implying acceptance.
  `IngestionRow` is the persisted acceptance record; Pricing and Events work may still be pending.
  Catalog's existing `from_scan_at` field means first known scan, not the predecessor of a pair.
- Persisted `v4_*` table names and `ORCA_V4_INGEST_CRON_ENABLED` retain their existing names.
  Callable paths use the unversioned modules below.

## Design invariants

- Top-level composition selects inputs and makes fan-out, transaction grouping, failure handling
  and continuation explicit. Modules own projection and persistence; composition imports their
  phase files directly.
- Load each scan pair once and share it across initialization, Catalog, History and Events.
  Pass prepared payloads across Convex mutation boundaries. [Objects](objects/README.md) owns
  source selection and compressed transfer.
- Commit Models, Providers, Endpoints, current Stats, Listings, the ingestion record and Pricing/Events obligations
  in one transaction. Acceptance advances the shared observation clock in `clock.ts`.
- Commit each History/Events payload and its work completion together, including empty output. Validate
  both pair times against the obligation's ingestion. Completed work is idempotent.
- Await Pricing and Events independently after acceptance, then schedule continuation.
  Failed History/Events attempts remain pending for manual retry. An interrupted routine resumes from
  the clock on the next cron/manual run.
- Current Stats stores its observation time and readings in one snapshot document, committed with
  Catalog acceptance. A failed snapshot write rolls back the entire acceptance transaction.
- History query cutoffs bound observation time. Listings is complete through acceptance; pending
  Pricing/Events work can leave gaps below that cutoff. Current Stats is complete through acceptance.
- Product history subscriptions read committed rows independently of the shared clock. Listings
  discovers historical model members and supplies their complete per-endpoint context. Pricing
  paginates oldest first with reactive row/byte limits. The chart subscribes to its horizon separately;
  late inserts refresh history without a new cutoff. Reactivity does not imply processor completeness.
- Pricing history stores and queries observations by `endpoint_id` only; it has no knowledge of
  model membership or grouping endpoints under a model. Preserve per-endpoint pagination for
  potentially large histories. Consumers use the separate Listings lens to select endpoints and
  interpret their prices; fetching prices outside a selected model's membership is acceptable.

## Observation semantics

- `scan_at` dates ORCA's observation. Baseline rows establish the first retained knowledge.
- Catalog `from_scan_at` is the first retained observation of an identity; `scan_at` dates its current facts.
  Initialization and new inserts populate it; updates preserve it, including absence on legacy rows.
  See [first-observation semantics and the completed backfill](../../../docs/orca/v4-catalog-first-observation.md).
- Catalog retains departed entities' last-known facts. The grid includes listed endpoints and
  endpoints unlisted within 30 days of the shared clock. Listed baseline rows are immediately readable.
- Events observes models through their endpoints, just like providers. Historical model metadata
  remains in Catalog without generating Events while the model has no endpoints.
- Every new ADD carries `previously_known`. Earlier Listings establishes knowledge for all entities;
  models also use Catalog `from_scan_at`, falling back to `scan_at` for unbackfilled rows. Metadata
  updates can erase that fallback evidence for historical models without earlier listings. See [the known limitation](../../../docs/events/foundation.md#known-limitation-historical-models).
  Event retries exclude their own and later listing observations; renderers read only stored facts.
- Keep model/provider metadata with its owning entity and
  [provider labels endpoint-local](../../../docs/orca/provider-identity.md).
- Pricing carries through continuous availability; reappearance supplies a fresh quote. Historical
  windows need entering prices and listings. The grid omits zero prices; History preserves them.
- `scan/` applies text scope, assembles entity identities and discards endpoint `status` internally. Consumers validate
  required facts; malformed optional facts may become unknown.
- JSON canonicalization sorts object keys and string arrays recursively, including within pricing
  overrides. Arrays of override objects retain their order.
- Stats history is dormant.

## Initialization and recovery

A fresh timeline initializes from the previous scan of its first selected pair, one table
mutation at a time, then processes that pair. Partial initialization requires investigation/reset
before restarting.

`start_at` requires a fresh timeline and accepts an ISO date or timezone-qualified timestamp.
The first capture at or after it becomes the baseline. Omit it to resume from the shared clock.

Preview deployment `init` schedules this routine with a rolling two-day `start_at` on a fresh
timeline, or resumes an existing clock. Configure the Objects source deployment and shared API
key in preview environment defaults; initialization uses the same remote source as dev replay.

Run from `packages/backend`, selecting the deployment explicitly:

```sh
bunx convex run --deployment dev routine:run '{"start_at":"2026-09-20"}'
```

| Operation                   | Function                               | Arguments                                                                                   |
| --------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------- |
| Resume ingestion            | `routine:run`                          | `{}`                                                                                        |
| Inspect pending work        | `ingestion/progress:listProcessorWork` | `{"processor":"pricing","state":"pending","paginationOpts":{"numItems":100,"cursor":null}}` |
| Retry one obligation        | `retry:pricing` / `retry:events`       | `{"work_id":"…"}`                                                                           |
| Send one Discord event      | `alerts/discord/delivery:send`         | `{"event_id":"…"}`                                                                          |
| Replay latest Discord cards | `alerts/discord/delivery:sendLatest`   | `{}` (latest 10), or `{"limit":15}`                                                         |

Discord delivery requires `ORCA_DISCORD_WEBHOOK_URL` in the target deployment's environment.
`alerts/discord/delivery:sendExamples {"event_ids":["…"]}` replays selected events with two-second gaps.
For self-serve demos, `alerts/discord/delivery:sendLatest {}` sends the latest 10 renderable events, oldest first.
Use `{"limit":15}` to choose another count (1–50). It applies the current renderer filter and
inspects at most the newest 500 captured events, so it can return fewer cards. The result reports
`sent` and `skipped`; skipped events are those rejected by the renderer while selecting examples.
Run it in the Convex dashboard or from `packages/backend` with an explicit deployment:

```sh
bunx convex run --deployment fantastic-mosquito-881 alerts/discord/delivery:sendLatest '{}'
```

The event ID is a stored `v4_events` document ID. Each `send` call makes one request and waits for Discord's
confirmation; errors surface to the caller. There is no retry or deduplication, so calling twice can post twice.

`ORCA_DISCORD_PREVIEW_ENABLED=true` schedules fresh routine event batches for the private pre-alpha
channel, with two-second gaps. Manual retries do not broadcast. There are deliberately no delivery
guarantees, backfill, or cross-batch ordering. Leave it disabled while catching up or cleaning history.
See [Discord preview rollout](../../../docs/orca/v4-discord-preview.md) for accepted limitations,
rollout status and live preview controls.

`ORCA_V4_INGEST_CRON_ENABLED=true` admits new hourly cron starts. Existing continuation chains
and manual runs proceed independently of the flag.

For a short source-backed demo timeline, follow [V4 development data](../../../docs/orca/v4-development-data.md).
The [Pricing History demo notes](../../../docs/orca/v4-pricing-history.md) describe how consumers
join listing context and prices, and which product-interface decisions remain open.

# V4

Catalog retains cumulative entity knowledge; Pricing, Listings and Events retain observation history;
current Stats publishes the latest endpoint readings.

Events is an internal source for [`eventRenderers/`](../../../../docs/events/renderers.md). Renderers
own consumer-facing interpretation and phrasing; products compose them with retrieval and delivery.

## Design invariants

- Top-level composition selects inputs and makes fan-out, transaction grouping, failure handling
  and continuation explicit. Modules own projection and persistence; composition imports their
  phase files directly.
- Load each pair once and share the observations across initialization, Catalog, History, Events and Stats.
  Pass prepared payloads across Convex mutation boundaries. [Objects](../objects/README.md) owns
  source selection and compressed transfer.
- Commit Models, Providers, Endpoints, Listings, the ingestion record and Pricing/Events obligations
  in one transaction. Acceptance advances the shared observation clock in `clock.ts`.
- Commit each History/Events payload and its work completion together, including empty output. Validate
  both pair times against the obligation's ingestion. Completed work is idempotent.
- Await Pricing, Events and Stats independently after acceptance, then schedule continuation.
  Failed History/Events attempts remain pending for manual retry. An interrupted routine resumes from
  the clock on the next cron/manual run.
- Stats stores its observation time and readings in one cache document. Newer publications supersede older attempts;
  failure retains the previous snapshot, and recovery selects the latest ingested observation.
- History query cutoffs bound observation time. Listings is complete through acceptance; pending
  Pricing/Events work can leave gaps below that cutoff. Stats publishes independently.
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
  See [the backfill procedure](../../../../docs/orca/v4-catalog-first-observation.md).
- Catalog retains departed entities' last-known facts. The grid includes listed endpoints and
  endpoints unlisted within 30 days of the shared clock. Listed baseline rows are immediately readable.
- Events observes models through their endpoints, just like providers. Historical model metadata
  remains in Catalog without generating Events while the model has no endpoints.
- Every new ADD carries `previously_known`. Earlier Listings establishes knowledge for all entities;
  models also use Catalog `from_scan_at`, falling back to `scan_at` for unbackfilled rows. Metadata
  updates can erase that fallback evidence for historical models without earlier listings. See [the known limitation](../../../../docs/events/foundation.md#known-limitation-historical-models).
  Event retries exclude their own and later listing observations; renderers read only stored facts.
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

Preview deployment `init` schedules this routine with a rolling two-day `start_at` on a fresh
timeline, or resumes an existing clock. Configure the Objects source deployment and shared API
key in preview environment defaults; initialization uses the same remote source as dev replay.

Run from `packages/backend`, selecting the deployment explicitly:

```sh
bunx convex run --deployment dev v4/routine:run '{"start_at":"2026-09-20"}'
```

| Operation              | Function                                  | Arguments                                                                                   |
| ---------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| Resume ingestion       | `v4/routine:run`                          | `{}`                                                                                        |
| Inspect pending work   | `v4/ingestion/progress:listProcessorWork` | `{"processor":"pricing","state":"pending","paginationOpts":{"numItems":100,"cursor":null}}` |
| Retry one obligation   | `v4/retry:pricing` / `v4/retry:events`    | `{"work_id":"…"}`                                                                           |
| Refresh current Stats  | `v4/refreshStats:run`                     | `{}`                                                                                        |
| Send one Discord event | `v4/discord:send`                         | `{"event_id":"…"}`                                                                          |

Discord delivery requires `ORCA_DISCORD_WEBHOOK_URL` in the target deployment's environment.
`v4/discord:sendExamples {"event_ids":["…"]}` replays selected events with one-second gaps.
The event ID is a stored `v4_events` document ID. Each `send` call makes one request and waits for Discord's
confirmation; errors surface to the caller. There is no retry or deduplication, so calling twice can post twice.

`ORCA_DISCORD_PREVIEW_ENABLED=true` schedules fresh routine event batches for the private pre-alpha
channel, with one-second gaps. Manual retries do not broadcast. There are deliberately no delivery
guarantees, backfill, or cross-batch ordering. Leave it disabled while catching up or cleaning history.
See [Discord preview rollout](../../../../docs/orca/v4-discord-preview.md) for accepted limitations,
rollout status and live preview controls.

`ORCA_V4_INGEST_CRON_ENABLED=true` admits new hourly cron starts. Existing continuation chains
and manual runs proceed independently of the flag.

For a short source-backed demo timeline, follow [V4 development data](../../../../docs/orca/v4-development-data.md).
The [Pricing History demo notes](../../../../docs/orca/v4-pricing-history.md) describe how consumers
join listing context and prices, and which product-interface decisions remain open.

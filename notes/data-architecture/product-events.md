# Product-driven change events

This is the consumer contract for the local `bun:sqlite` history builder. It is derived from what
the current products query and render, not from the Convex materialization/change pipeline.

Complete replay evidence and the empty-catalog correction are recorded in
[full-history-findings.md](full-history-findings.md). Intended consumer read adapters are specified
separately in [product-queries.md](product-queries.md).

## Product requirements

### Monitor

Monitor pages by changed crawl, newest first, optionally filtered by model slug and provider
organization. Within a crawl it needs:

- model and endpoint availability transitions;
- one update event per changed entity, containing its selected field changes;
- raw field paths and before/after values for formatting, numeric deltas, and set differences;
- model name/description/modalities and endpoint provider/context/pricing as they were at that crawl;
- stable event identity so immutable crawl responses can be cached forever.

The current implementation enriches events from today's catalog. That makes old cards historically
incorrect. Presentation context must instead be captured from the post-change state, or the last
known pre-change state for an unavailable event.

### Pricing History

For every endpoint of a model, Pricing History needs a chronological series of:

- endpoint available/unavailable transitions;
- changes to opted-in basic pricing fields;
- endpoint targeting identity and provider display metadata valid for each availability period;
- explicit history bounds.

Forward replay can emit these points directly. It must not reconstruct history backward from the
current catalog, impose a change-document cap, or leak prices between separate availability periods.
Chart granularity and coalescing are a read projection concern, not event-generation semantics.

### Alerts

Alerts consume the same model/endpoint events and presentation context as Monitor, then match model
slug patterns. Delivery state, retries, and historical suppression are separate from event storage.
Replaying an archive creates events but never delivery work.

### Grid and API

These consume the latest selected model/endpoint state plus the latest endpoint metrics observation.
The core schema covers most of their current requirements. Known gaps must be opted in only when a
cutover requires them; V2 variable pricing tiers are one current example. Metrics remain outside
entity history because their volatility must not generate Monitor events.

## Event contract

Generate one immutable entity event per entity per crawl:

```text
entity_event
  event_id              deterministic from processor version, crawl, entity type and entity id
  crawl_id / previous_crawl_id
  entity_type           model | endpoint
  entity_id             model slug or endpoint id
  event_type            available | updated | unavailable
  model_slug            query dimension (also present for endpoints)
  provider_name         endpoint organization filter dimension
  provider_slug         endpoint targeting key, never parsed as identity
  context_json          selected, period-valid presentation context

event_field
  event_id / ordinal
  path                   unrenamed core field path
  before_present / before_json
  after_present / after_json
```

Arrays remain before/after values in storage. Monitor may render them as sets when appropriate;
encoding a UI-specific set diff in the durable event would throw away ordering semantics.

Lifecycle events carry no synthetic field patches. `available` context is the new state;
`unavailable` context is the last known state. An `updated` event groups every selected field change
for that entity and carries its post-change context.

Provider fields remain endpoint properties. We will not initially create provider lifecycle events:
the upstream organization name, provider record slug, and endpoint targeting key do not form one
stable provider entity. A provider-oriented product view can be derived later with explicit rules.

## Local reference database

The repeatable `bun:sqlite` build owns:

- processor/crawl ledger, including failures and deterministic version;
- latest `models` and `endpoints` tables;
- latest `endpoint_metrics` observations;
- immutable `entity_events` and `event_fields`;
- indexes matching Monitor and Pricing History reads.

Replay is oldest to newest. A failed endpoint scope preserves its prior endpoints and cannot emit
false unavailability. Every crawl commits atomically. Rebuilding from an empty database must produce
the same event ids, rows, and final current view.

SQLite is the executable specification. A future D1 adapter must reproduce its behavior; Miniflare
is not needed to establish diff semantics or prove the complete archive.

## Proof gates

1. Golden two-crawl fixtures for create, update, delete, array, null/missing, and failed-scope cases.
2. Full archive replay with invariants and a deterministic database digest.
3. Product-shaped SQL queries for Monitor filters and forward Pricing History series.
4. Compare the terminal current view with a direct materialization of the last crawl.
5. Inspect representative historical cards and pricing series before adding a remote store.

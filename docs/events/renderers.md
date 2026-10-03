# Alerts and renderers

## Ownership

- `events/` produces and stores base entity events, independently of their consumers.
- Its record schema and the shared normalized schemas in `convex/entities.ts`
  describe the stored format; producers and readers share that seam.
- `alerts/shared/` owns reads, decoding, interpretation, default selection, eligibility and optional batching.
- `alerts/monitor/`, `alerts/feed/` and `alerts/discord/` own product queries, composition, rendering and delivery.
- Keep single-product helpers with that product; shared numerical and price formatting serves multiple products.
- Metadata stays arbitrary at capture; output modules validate and interpret the facts their products need.
- Products consume prepared alerts without importing ingestion, comparison or scan extraction.
- Steps compose through ordinary function calls; there is no pipeline framework or product registry.
- Stored table names remain unchanged. Old V4 callable paths are removed without compatibility exports.

## Shared preparation

- `shared/read.ts` owns captured-identity scope selection and preserves native pagination metadata.
- `shared/decode.ts` consumes structural wrappers once, independently of current Catalog state.
- The stored row supplies root identity and operation; duplicate payload fields are not reconciled.
- Shared preparation curates, applies eligibility and selects the default content for all three products.
- Parsing failures log the event identity and error, then omit the whole event; other events continue.
- Unselected external values need only be JSON. Prepared alerts require no further payload parsing.
- Products can deliberately specialize content through composition without changing captured events.
- Discord applies shared preparation before batching; failed and ineligible events never enter a batch.
- Each batch contains one identical field change and the affected identities and source event IDs.
- Fingerprints normalize object keys and string-set order within one observation and entity kind.
- Residual fields remain in individual alerts; empty updates disappear without reapplying eligibility.
- Monitor and Feed stay unbatched: arbitrary query pages do not define meaningful batch membership.

## Known limitation

- Indexed-array diffs inside selected object groups such as `data_policy` lose their numeric child keys silently.
- A change from `[{ training: false }]` to `[{ training: true }]` can disappear while other fields still render.
- No upstream occurrence is known; if observed, reject that group shape so preparation logs and skips the event.
- Arbitrary object-array rendering remains out of scope.

## Presentation and delivery

- Renderers accept prepared alerts; they never repeat curation, eligibility, field selection or batching.
- Feed owns JSON output, plain-text summaries, HTTP parameters and continuation URLs; `/events/feed` remains stable.
- Monitor's web rendering consumes prepared individual alerts through its product queries.
- Discord owns batch composition, cards, retrieval, pacing and posting; shared helpers contain no Discord markup.
- Discord-specific storage, if needed later, belongs with Discord rather than the base event records.
- Renderers truncate oversized display text and log diagnostics; source alerts remain unchanged.
- Delivery policy and accepted limitations live in `discord.md`.
- Delivery makes a permanent commitment: recipients retain messages while projected history can evolve.

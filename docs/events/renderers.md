# Alerts and renderers

- `v4/events` captures and stores entity events; `v4/alerts` prepares consumer-specific content from those facts.
- Alerts are presentation-independent; messages, cards and feed entries are rendered outputs.
- Steps compose through ordinary function calls in `alerts/pipelines.ts`; there is no pipeline framework.
- `events/decode.ts` parses stored payloads into lifecycle snapshots or update fields with captured paths.
- Snapshot schemas in `facts.ts` also type the producer's outputs; metadata remains arbitrary JSON.
- The stored row supplies root identity and operation; duplicate payload fields are not reconciled.
- Decoding consumes ORCA's structural wrappers once; `curate` interprets selected external values into supported alert shapes, independently of current Catalog state.
- Parsing failures in selected values or malformed payloads abandon that event. The shared preparation step logs its identity and error with `console.error`, then continues with other events.
- Unselected external values need only be JSON. Prepared alerts require no further payload parsing.
- Failed events never enter batching; no partial fields from a failed event survive.
- `isEligible` applies the existing coarse pricing policy; `select` applies Discord/Monitor field selection.
- `forDiscord` curates, filters, selects and batches; eligibility is checked before extracting repeated fields.
- `forMonitor` curates, filters and selects each event independently, without batching.
- `forFeed` curates and filters, retaining its broader field set and existing JSON contract.
- `batchAlerts` extracts identical field items into batches, retains other fields and drops empty updates.
- Each batch contains one field change and the affected identities and source event IDs.
- Fingerprints normalize object keys and string-set order within one observation and entity kind.
- `alerts/numbers.ts` shares exact decimal comparisons and formatting between policies and renderers.

## Known limitation

- Indexed-array diffs inside selected object groups such as `data_policy` are traversed as object changes. Numeric child keys are unselected, so those changes disappear without a diagnostic; other changes in the event can still reach batching and rendering.
- For example, changing `data_policy` from `[{ training: false }]` to `[{ training: true }]` alongside `context_length` produces only the context-length alert. This predates per-event recovery and is an exception to its intended whole-event behavior.
- No upstream occurrence is known. If observed, reject the unsupported group shape during curation so the existing recovery step logs and skips the event; arbitrary object-array rendering remains out of scope.

## Presentation and delivery

- Renderers accept prepared alerts; they never repeat curation, eligibility, field selection or batching.
- `renderers/json.ts` adds plain-text summaries and details to individual alerts.
- Discord entity cards own field layout and lifecycle presentation; batch cards paginate affected identities.
- Shared display helpers supply Discord markup; `discord/pricing.ts` supplies price presentation.
- Monitor's React components consume prepared entity alerts; its pipeline intentionally omits batching.
- `v4/feed.ts` and `v4/monitor.ts` own queries and pagination; filtering preserves native continuation cursors.
- `v4/feedHttp.ts` owns HTTP parameters and continuation URLs; the public HTTP routes stay unchanged.
- `v4/eventRenderers/feed.ts` preserves the old public Convex query paths as compatibility exports.
- `v4/discord.ts` owns retrieval, pacing and posting; its named pipeline logs preparation failures; the transformation steps remain pure.
- Renderers truncate oversized display text and emit `console.error` diagnostics; source alerts remain unchanged.
- Discord delivery policy and accepted limitations live in `discord.md`.
- Delivery makes a permanent commitment: recipients retain messages while projected history can evolve.

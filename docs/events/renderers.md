# Alerts and renderers

- `v4/events` captures and stores entity events; `v4/alerts` prepares consumer-specific content from those facts.
- Alerts are presentation-independent; messages, cards and feed entries are rendered outputs.
- Pure steps compose through ordinary function calls in `alerts/pipelines.ts`; there is no pipeline framework.
- `curate` interprets stored changes using upstream field names, independently of current Catalog state.
- `isEligible` applies the existing coarse pricing policy; `select` applies Discord/Monitor field selection.
- `forDiscord` curates, filters, selects and batches; eligibility is checked before extracting repeated fields.
- `forMonitor` curates, filters and selects each event independently, without batching.
- `forFeed` curates and filters, retaining its broader field set and existing JSON contract.
- `batchAlerts` extracts identical field items into batches, retains other fields and drops empty updates.
- Each batch contains one field change and the affected identities and source event IDs.
- Fingerprints normalize object keys and string-set order within one observation and entity kind.
- `alerts/numbers.ts` shares exact decimal comparisons and formatting between policies and renderers.

## Presentation and delivery

- Renderers accept prepared alerts; they never repeat curation, eligibility, field selection or batching.
- `renderers/json.ts` adds plain-text summaries and details to individual alerts.
- Discord entity cards own field layout and lifecycle presentation; batch cards paginate affected identities.
- Shared display helpers supply Discord markup; `discord/pricing.ts` supplies price presentation.
- Monitor's React components consume prepared entity alerts; its pipeline intentionally omits batching.
- `v4/feed.ts` and `v4/monitor.ts` own queries and pagination; filtering preserves native continuation cursors.
- `v4/feedHttp.ts` owns HTTP parameters and continuation URLs; the public HTTP routes stay unchanged.
- `v4/eventRenderers/feed.ts` preserves the old public Convex query paths as compatibility exports.
- `v4/discord.ts` owns retrieval, pacing and posting; its named pipeline remains pure.
- Renderers truncate oversized display text and emit `console.error` diagnostics; source alerts remain unchanged.
- Discord delivery policy and accepted limitations live in `discord.md`.
- Delivery makes a permanent commitment: recipients retain messages while projected history can evolve.

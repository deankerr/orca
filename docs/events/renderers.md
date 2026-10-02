# Renderers

- `v4/events` supplies captured facts; `v4/eventRenderers` owns shared curation and phrasing for consumers.
- Keeping experimental renderers together lets the feed, Grid, and Discord reuse interpretation as it develops.
- `render(event)` and `renderPage(page)` interpret captured facts independently of current Catalog state.
- JSON combines structured changes with plain-text `summary` and `details`; products choose markup and navigation.
- `selectEvent` shares Discord/Monitor event eligibility and field selection after curation and pricing filtering.
- Provider URL selection and endpoint reasoning exclusion live there; renderers consume the selected changes.
- Monitor uses native reactive pagination, with model/provider activity scoped to captured relationships.
- Medium-specific renderers may customize field labels and value presentation while sharing the projection schema.
- Presentation rules do not rewrite captured IChange operations or shared curated changes.
- Discord entity cards own field-specific rules; `discord/fields` supplies generic display and `discord/pricing` prices.
- Entity cards consume one curated event; Discord batch cards collect one identical field change across entities.
- Batch fingerprints normalize object keys and string-set order; different operations and values stay separate.
- Model introductions and related endpoint additions remain separate events.
- Reading each event as a sentence exposes ambiguity in the structured shape and helps refine it.
- Lifecycle text describes an offering and selected useful facts; departure details use "when last observed".

## Composition and delivery

- `groupEvents` composes selected events into single-field batches and remainders; it contains no Discord markup.
- `renderDiscordBatch` owns selection, composition and card rendering; delivery owns reads, pacing and posting.
- Batching is currently Discord-only; Monitor pages can split scans and must not determine batch membership.
- Discord scope, preview experiments, and delivery proposals live in `discord.md`.
- Delivery makes a permanent commitment: recipients retain sent messages while projected history can evolve.

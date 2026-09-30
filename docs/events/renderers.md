# Renderers

- `v4/events` supplies captured facts; `v4/eventRenderers` owns shared curation and phrasing for consumers.
- Keeping experimental renderers together lets the feed, Grid, and Discord reuse interpretation as it develops.
- `render(event)` and `renderPage(page)` interpret captured facts independently of current Catalog state.
- JSON combines structured changes with plain-text `summary` and `details`; products choose markup and navigation.
- Reading each event as a sentence exposes ambiguity in the structured shape and helps refine it.
- Lifecycle text describes an offering and selected useful facts; departure details use "when last observed".

## Composition and delivery

- Products own model-level grouping, waiting, batching, and handling bursts of activity.
- Planned: Discord coalesces related activity before delivery.
- Planned: Discord renders internally to serialized output, then records delivery separately.
- Delivery makes a permanent commitment: recipients retain sent messages while projected history can evolve.

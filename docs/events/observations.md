# Observed scale

## September 2026 working inventory

- Roughly 2.8K retained endpoints, 1K models, and 159 providers; many endpoints departed long ago.
- The active population is smaller than the retained inventory.
- At this scale, scan-wide entity updates fit comfortably within mutation document-count limits.
- Large lifecycle payloads can still hit byte limits; investigate such batches before adding special batching.
- Pricing dominates event volume across observed periods, making a pricing-only index weakly selective.
- Derive pricing involvement while interpreting fetched events at this scale.

## September 29, 2026 replay

- Source: `dependable-husky-550`; replay deployment: `confident-fly-212`.
- Baseline: `2026-09-29T00:40:04.340Z`; final observation: `2026-09-29T11:40:04.294Z`.
- Eleven consecutive ingestion pairs produced 230 endpoint events: 226 UPDATEs, two ADDs, and two REMOVEs.
- Curation retained 158 items: 154 updates, two arrivals, and two departures.
- Representative scoped histories contained 11 exact-endpoint, 23 model-activity, and 35 provider-activity items.
- An Inceptron / GLM 5.3 Flash input rate changed from `"0.0000001"` to `"0.00000015"` per token.
- An io.net / Nemotron membership change added `"tools"` to `supported_parameters`.

## Pagination exercise on that replay

- A new head event was inserted after saving a continuation, then the original traversal resumed.
- Every original curated item appeared exactly once; rereading the head exposed the inserted event.
- The traversal crossed 47 source pages, including an empty curated page.
- A later HTTP traversal with `limit=100` returned the same history across three pages.

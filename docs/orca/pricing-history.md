# Pricing History

A model's chart combines endpoint quotes with historical availability and relationships.
Today's Catalog membership cannot reconstruct those histories.

## Historical membership

- Endpoint UUIDs retain identity across model moves, including moves to or from a `:free` variant.
- Discover endpoints through historical model membership, then read their complete context and quote histories.
- The observation ending membership in model A can be indexed under model B.
- Filter quotes into the selected model's membership spans when assembling the chart.
- Tags label endpoints; grouping by tag must not collapse distinct endpoint quotes.

## Loading decision

Use two independent model-wide queries: endpoint observations and prices, each grouped by endpoint UUID.
Complete results keep the consumer simple; both subscriptions start alongside the shared public clock.

The production study in `docs/evidence/2026-10-13-pricing-history/README.md` supports this choice.
Its largest measured model fit within transaction and return limits. Legacy listings supplied the context proxy;
regenerated observations can differ, so the study establishes capacity for its recorded population.

- Accept repeated membership reads and broader price-query invalidation in exchange for two ordinary subscriptions.
- Keep the clock out of history query arguments and reads; clock-only advances need not reread unchanged histories.
- Derive the join from query results and wait for initial results before rendering.
- New observations remain reactive, including discovery of additional historical endpoints.
- Collect complete histories without a silent row cap.
- Reassess pagination as model membership, history size, or payload size approaches transaction or per-array limits.
- Reassess measured read/return budgets against current platform limits; the dated study is not a growth bound.
- Stats has a different retention scale and needs its own capacity evidence.

## Quote continuity

| Observation            | Meaning                                                                      |
| ---------------------- | ---------------------------------------------------------------------------- |
| Baseline               | Start retained knowledge; invent no earlier span.                            |
| New quote while listed | Replace the complete quote, not individual meters.                           |
| Tag/provider change    | Change historical context; carry the quote if no new one arrives.            |
| Model change           | End the old membership and begin the new one, carrying the endpoint's quote. |
| Unlisting              | End availability and clear the quote for any future listing period.          |
| Reappearance           | Begin a new availability period with its fresh observed quote.               |
| Missing/invalid meter  | End that meter's trace; do not carry an older meter forward.                 |
| Zero meter             | Preserve the observation but omit it from positive-rate traces.              |

- Apply endpoint observations and quotes at a shared timestamp together.
- Closed spans are half-open `[start, end)`; a still-current span may include the chart horizon.
- Long ranges plot daily samples while inspection uses exact observations.
- Conditional-price visualization is outside the chart's current scope.

## Completeness and recovery

The public clock supplies this chart's observation horizon. Interpretation excludes later observations and prices,
so a clock-only advance can reveal already-loaded rows. Query failures use the application's error recovery.

- Before any complete ingestion record, a null clock gives the chart its empty state.
- Completed forward ingestion supplies histories through that scan; older retained gaps can still affect charts.
- The public history interface exposes no explicit timeline baseline.

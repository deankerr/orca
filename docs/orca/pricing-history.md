# Pricing History

Pricing observations belong to endpoint UUIDs. A model's chart combines those quotes with
historical availability and model/provider/tag relationships from Listings. Today's Catalog
membership cannot reconstruct that history.

## Historical membership

An endpoint can change model while retaining its UUID, including moves to or from a `:free`
variant. Discover endpoints through a model's historical listings, then consider each endpoint's
complete listing history: the row ending membership in model A can be indexed under model B.

Pricing retrieval remains endpoint-scoped. Model grouping and membership interpretation belong
to this product. Fetching quotes outside the selected model's membership is acceptable; filtering
them into the correct spans happens when the chart is assembled.

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

Apply listings and quotes at a shared timestamp together. Closed spans are half-open
`[start, end)`; a still-current span may include the chart horizon. Tags are labels, not unique
identities, so grouping by tag must not collapse distinct endpoint quotes.

The chart plots daily samples over long ranges but inspects exact observations. Conditional-price
visualization is outside its current scope.

## Completeness and recovery

History is complete through the accepted scan for new ingestions. Gaps in older retained history
can still affect charts.

Per-endpoint pagination protects against large histories. Empty partial pages require continuation,
and any endpoint query error blocks presentation of a partial chart.

Retry currently remounts pagination with the same cache identity. A cached query error can survive
until the subscription updates or expires. Public history exposes no explicit timeline baseline.

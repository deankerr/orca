# Endpoint history

Endpoint UUIDs provide continuity across changes to model, provider, provider tag, and availability.
A model view selects periods of membership; an endpoint view follows the identity across its retained history.

## Identity and historical context

- Model and provider associations are historical facts; today's current view cannot reconstruct earlier membership.
- Provider tags are changing, non-unique routing labels; a tag change does not create a new endpoint.
- Historical model selection includes departed endpoints and endpoints that moved to another model.
- A move-away observation can be indexed under the destination model; full endpoint context closes earlier membership.
- Interpret provider associations under the normalization rules that produced the retained observations.

## Sparse histories

| History               | Retained meaning                                                         | Meaning of no new row                                 |
| --------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------- |
| Endpoint observations | Listing state and model/provider/tag context at baseline and transitions | Prior state continues                                 |
| Pricing               | Complete quotes at baseline and quote changes                            | Prior quote continues within its availability period  |
| Stats                 | Supplied readings, including repeated values                             | No reading; neither carry forward nor substitute zero |

- `catalog_observations` stores endpoint listing history alongside model presence/count and provider count histories.
- Model presence is independent of endpoint availability; an endpointless model can remain detected upstream.
- Shared endpoint identity and scan time do not give these histories interchangeable absence semantics.
- Reducing retained stats cadence does not turn readings into a change log.
- Pricing quote continuity and chart boundaries are defined in `pricing-history.md`.

## Query boundaries

Storage follows endpoint identity; products choose subscription granularity for their access patterns.
Historical context can be reused while walking quotes or readings rather than joined through a lookup per row.

- Pricing uses complete model-wide observation and price queries; `pricing-history.md` owns the capacity rationale.
- Larger streams can discover membership, then paginate endpoint histories independently using native Convex pagination.
- A price-range lookup needs the preceding quote and availability context; a stats range inherits no preceding reading.
- Independent endpoint page chains need no merged cursor or synchronized page completion.
- Derive spans, lookup maps, and plotted points from query results; avoid maintaining a second synchronized copy.
- Brief differences between reactive streams are acceptable where product interpretation tolerates them.
- Products needing a common observation horizon can consume the public clock and exclude later rows.

## Context representation

Keep availability, associations, and provider tags together so pricing and stats can interpret the same sparse context.
Fields and indexes should earn their cost through required access paths and measured populations.

- Derive intervals from adjacent transitions; advancing a horizon need not rewrite an open interval.
- Context attached only to quote-change rows cannot explain later context changes while the quote remains unchanged.
- Model departure ends model membership; endpoint unlisting ends availability. A single tombstone cannot conflate them.
- Stats retains repeated readings, so pricing-history measurements do not establish its storage or loading costs.

## Source capture selection

A sparse observation's timestamp identifies a transition, not necessarily the last scan containing the entity.
Current-view refresh uses the entity's own observation history through the completed cutoff.

- Presence uses model `detected`, endpoint `detected`, or a positive provider `endpoint_count`.
- An entity present at the cutoff uses that cutoff's capture.
- A departed entity uses `from_scan_at` from the completed registration at its departure observation.
- Do not substitute the last positive observation or subtract an assumed scan interval; unchanged spans can be long.
- Current-view `scan_at` identifies the source of retained facts and may precede the last capture containing the entity.

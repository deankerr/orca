# Endpoint history design memo

This memo records the reasoning behind endpoint-scoped history and the schema choices still
open for consideration. It establishes a query baseline against which optimizations can be
evaluated. It does not select a replacement schema or prescribe a frontend overhaul.

## Identity and historical context

An endpoint UUID provides continuity across changes to model, provider, provider tag, and
availability. A model view selects endpoints and periods of membership; an endpoint view follows
the same identity across its complete retained history. Both are first-class uses of the data.

Model and provider associations are historical facts. A provider tag is a changing, non-unique
routing label. A tag change does not create a new endpoint, and neither tag grouping nor a chart
segment should redefine endpoint identity.

`docs/openrouter/appendix/endpoint-identity-changes.md` establishes that model changes are rare
relative to tag changes in the retained population. Rarity informs the cost of supporting these
transitions; it does not establish immutable model membership.

## Sparse state and sparse readings

Listings and Pricing record baseline state and subsequent changes. Within retained history,
an absent row means that the preceding state continues. Pricing stores complete quotes, so a
new quote replaces all meters rather than patching individual rates. Listings supplies the
availability transitions needed to interpret quote continuity. The detailed pricing rules
remain in `pricing-history.md`.

Stats records supplied readings, including repeated values. An absent reading is an absence,
not an instruction to carry forward the previous sample or substitute zero. Reducing the
sampling cadence changes the observations retained; it does not turn stats into a change log.

The histories share endpoint identity and scan time, but their sparse rows have different
meanings. Shared navigation must preserve those meanings. Products can derive spans and plotted
points without expanding the stored data into a dense endpoint-by-scan grid.

Brief incomplete views while reactive subscriptions receive an ingestion are acceptable.
They do not justify cross-stream completion barriers or additional schema coordination. This
tolerance does not change the meaning of retained absence or make persistent ingestion gaps
equivalent to observed missing readings.

## Scale informing the design

Approximate production dashboard counts reported during the 2026-10-11 design discussion:

| Table                         | Documents |
| ----------------------------- | --------: |
| `v4_endpoints`                |      2.9K |
| `v4_endpoint_listing_history` |      6.2K |
| `v4_endpoint_pricing_history` |       19K |
| `v3_endpoints_stats_series`   |        8M |

These are reported counts, not a fresh deployment audit. The stats count describes a dormant
legacy table using the standard hourly samples; it is evidence of the expected scale difference,
not a measurement of the current stats-history schema.

Duplicating context in Pricing may be affordable while duplicating it across stats is material.
Fields and indexes should earn their cost through concrete access paths. The much smaller
Listing history can be reused across many pages of quotes and readings.

## Independent endpoint streams are the query baseline

A client beginning with a model ID can first discover its historical endpoint membership, then
operate independently on each endpoint:

1. Read the endpoint's full Listing history, including associations with other models.
2. Read its quotes or stats through an independently paginated endpoint/time query.
3. Use historical context to select the periods belonging to the requested model.

Membership discovery starts the parallel work; it does not require merging endpoint streams
into a shared cursor. Each endpoint can have a different number of pages, complete independently,
and receive new observations without coordinating its pagination with the others. An endpoint
view starts directly with that endpoint's histories.

Complete Listing history per endpoint is expected to remain small enough for one query. It can
also be paginated without changing the model. Measurement pagination is a routine part of the
interface, especially for stats. A direct jump into a pricing range needs the applicable preceding
quote and availability context; stats does not inherit a preceding reading.

Historical context need not be joined through a database lookup for every observation. Load it
once and reuse it while walking ordered pages of measurements. Product interpretation can run
over the available sparse records without awaiting the entire model's history.

The existing model membership, endpoint Listings, and endpoint Pricing readers already largely
support this baseline. Several small queries are an intentional decomposition with clear cursor
ownership. Optimize their reads, transferred bytes, cache reuse, invalidation, and client work
rather than treating query count or time to the full result as the sole objective.

## Locating a source scan through membership

Listing history also identifies the last retained scan in which a model or provider had
endpoints. A Catalog row's `scan_at` identifies the source of its retained facts and may be
older than that scan. A separate last-seen field is not required for endpoint-bearing membership.

For a chosen observation horizon, read a model's or provider's indexed Listing rows and retain
the latest matching row per endpoint. An unlisted row closes that endpoint's membership. For a
listed row, inspect the endpoint's next Listing row through the horizon: a move can close
membership in a row indexed under a different model or provider. If there is no successor,
membership remains current and the horizon itself is a source scan containing the entity.

If every membership has closed, find the latest closing transition. The accepted ingestion at
that transition's `scan_at` records `from_scan_at`, the exact last scan containing an endpoint
for the selected model or provider. Do not substitute the latest listed row's timestamp or
subtract an assumed sampling interval. Sparse rows can leave a long interval between the last
listing change and the last actual presence.

This lookup needs indexed context reads, endpoint-successor lookups where necessary, and one
accepted scan-pair lookup. It does not require replaying source captures or searching Pricing
or Stats. The resulting scan time identifies a stored capture that can be loaded for refresh.

A model's last scan with endpoints differs from its last presence in the source model list.
Models commonly remain in that list after their endpoints disappear. Prefer the latest accepted
capture when the model is still present there; historical membership supplies an earlier source
when needed. Models with no endpoints anywhere in retained history have no membership-derived
source location. Their Catalog source reference still identifies a known observation, but
Listings cannot establish their final endpointless source observation.

Provider provenance follows the embedded endpoint observations used to assemble that provider.
Interpret historical provider IDs under the identity policy that produced those rows; production
history and a newly normalized regeneration can contain different provider groupings.

## Schema alternatives

### Keep availability, associations, and tags together

The current Listings row is a complete historical context at a transition. This is a compact
source for both pricing and stats interpretation. It repeats associations when only a tag changes,
but avoids coordinating separate context histories. The current scale gives no demonstrated
reason to replace this shape.

### Separate provider-tag history

Tags can have their own endpoint/time history while availability and model/provider associations
remain together. This would separate frequent label changes from less frequent relationship
changes. Consumers needing both would compose two small histories, with baseline context retained
for each. The semantic distinction is valid; the storage and subscription benefit remains to be
established. Separating storage need not change the domain meaning of a Listing.

### Store intervals instead of transitions

Intervals are useful for selecting historical membership. They can be derived from adjacent
transitions, with the latest interval left open. Persisting an end time adds maintenance when the
next transition arrives. It should serve a concrete interval-query requirement; needing intervals
in a chart alone does not require storing them. Advancing the ORCA clock need not rewrite an open
interval or invalidate the underlying transition history.

### Put context in Pricing

Adding `model_id`, `provider_id`, or `provider_tag` only to quote-change rows captures context
when that quote was observed. It does not describe later context changes during an unchanged
quote's lifetime. Such fields can support specific access paths, but do not by themselves make
model-scoped pricing retrieval self-contained.

A self-contained history would also record relevant context changes and availability termination.
At Pricing's scale this remains a valid option. Its rows would then represent both quote and
context transitions, which consumers must distinguish. In particular, Discord currently uses
pricing-row frequency to filter repricing alerts; context-only entries would alter that meaning.

An unlisted Listing already explicitly ends availability. A Pricing tombstone could make that
termination independently readable, but model departure and endpoint unlisting have different
effects: the former ends membership while the endpoint's quote may continue. Tombstones need a
defined scope and do not replace the need to represent association changes.

## Optimizations that do not require a new history model

A shared client projection can make membership and endpoint context available throughout the app.
A chart could already know its endpoints and their histories when it opens. Individual queries,
bulk loading, cached pages, and a global provider are delivery choices behind the same navigation
interface; none requires repeating context in measurement rows.

Derive lookup maps and intervals from retained transitions. Under append-only ingestion, earlier
transitions remain immutable while the latest projection grows. Keep the moving observation
horizon separate from that history. A shared projection should reuse query results rather than
introduce a second independently synchronized source of truth.

Reactive delivery makes progressive consumption practical. Frontend loading behavior, shared
subscriptions, caching, and chart rendering can be improved separately from schema selection.
These possibilities explain what the data model should support; they are not prerequisites for
retaining the current schema.

## Current assessment

Endpoint/time histories, separate sparse-state and sample semantics, and reusable Listing history
already support the intended dialogue with the data. No schema replacement has been selected.
The strongest open structural question is whether tag history benefits from separate storage.
Denormalized pricing context remains a valid alternative when its additional writes and consumer
semantics buy a simpler required access path. Any choice should preserve straightforward endpoint
retrieval and independent pagination for both pricing and stats.

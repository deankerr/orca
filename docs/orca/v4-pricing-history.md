# V4 Pricing History

Pricing History is implemented in `apps/web/features/pricing-history/` and
verified against the short dev timeline. V4 queries expose observations; the product assembles
endpoint membership, availability, tags, and quotes over time using the separate modules below.

## Module responsibilities

- **Pricing history backend (`v4/history/pricing/`):** stores and retrieves pricing observations
  by `endpoint_id`. It has no knowledge of model membership or of multiple endpoints being
  grouped under a model. Its live query accepts an endpoint UUID and pagination options;
  it does not discover endpoints, join listings, or filter prices by model membership.
  The separate cutoff-pinned reader remains available for snapshot inspection.
- **Listings:** supplies the availability and model/provider/tag context lens, shared by pricing
  and stats consumers. A model-scoped query discovers historical endpoint UUIDs, then a small
  complete listing query per UUID supplies context including later moves to other models.
  Pricing History is currently its only product consumer, so the join stays local to that feature.
- **Pricing History product:** discovers endpoint UUIDs through Listings, loads their context and pricing
  observations, and assembles the model-specific chart. Model grouping belongs here, outside
  the pricing history backend module.

Pagination protects an individual endpoint read: one endpoint could have more pricing entries
than can safely be returned in one response. That case is expected to be rare and has not been
established by this assessment, but consumers must honor `isDone` and `continueCursor`.
Pagination does not imply model-aware retrieval or require membership-window queries.

Loading an endpoint's prices through the cutoff may include observations outside its membership
in the selected model. That is acceptable; the product applies the lens when assembling spans.
The [production report](v4-listing-model-changes.md) found only 19 model transitions, all following
slug-correction or `:free` variant patterns. Over-selection of pricing rows is not a demonstrated
problem and does not justify additional filtering machinery in the pricing module.

A `:free` variant is expected to have no price churn while free. Whether the product should show
Pricing History for it is a separate presentation question, not a pricing retrieval rule. The
transition itself remains a genuine model change from ORCA's perspective.

## Verification dataset

Use the [short development timeline](v4-development-data.md) beginning September 25, 2026.
Show one model's endpoint availability and presented input/output rates, with historical provider
tags. Include an endpoint removal/reappearance and a context change without a new price.
This is enough to exercise the join; replaying the whole archive is unnecessary.

The chart displays positive metered rates with historical tags and real availability gaps.
Long ranges use daily samples for plotting and exact observations for price inspection.
Zero and missing meters close positive-rate spans; conditional-price visualization is outside
the current display scope.

### Verified examples in the dev deployment

Both examples were read through the public V4 history queries on `reliable-swan-376`, pinned to
`2026-09-26T15:40:04.139Z`, after all processor work completed.

**Context changes while price stays valid:** `deepseek/deepseek-v4-flash-0731`, endpoint
`fc1cac03-9834-4ed8-8dfe-2dfb8543b690`.

- Baseline: listed through `morph` at `2026-09-25T00:40:04.073Z`.
- At `2026-09-26T03:40:04.065Z`, still listed, but its tag becomes `morph/bf16`.
- There is exactly one price row in the retained timeline, at the baseline: input `$0.141953`
  and output `$0.399625` per MTOK.
- Expected demo: continuous pricing through the cutoff, split into the two historical tag spans.

**Actual availability gap despite identical prices:** `z-ai/glm-5.3`, endpoint
`82a156b9-c0da-45cf-8034-c56e80e9a040` on `primeintellect`.

- Listed at the baseline, unlisted at `2026-09-26T02:40:04.229Z`, and listed again at
  `2026-09-26T03:40:04.065Z`.
- Baseline and reappearance both supply input `$1.40` and output `$4.40` per MTOK.
- Expected demo: two availability spans with a gap, even though the numerical prices match.

Inspect either example from `packages/backend`:

```sh
ARGS='{"endpoint_id":"fc1cac03-9834-4ed8-8dfe-2dfb8543b690","cutoff":"2026-09-26T15:40:04.139Z","paginationOpts":{"numItems":100,"cursor":null}}'
bunx convex run --deployment reliable-swan-376 v4/history/listings/query:list "$ARGS"
bunx convex run --deployment reliable-swan-376 v4/history/pricing/query:list "$ARGS"
```

Change `endpoint_id` for the second case. These short histories each fit one page; a client must
still honor `isDone` and `continueCursor`. Both examples were verified through the V4 queries,
trace builder, and browser chart. Unit checks also cover model moves, missing/zero meters, and
daily-sampling boundaries. Browser verification exercised multi-page retrieval, including empty
partial pages. A dev pricing read forced to one row per page verified real cursor traversal.

## What the stored observations mean

| Input         | Meaning for this product                                                    |
| ------------- | --------------------------------------------------------------------------- |
| Endpoint UUID | Identity across tag, provider, and model changes                            |
| Listing row   | Availability and model/provider/tag context at an observation               |
| Pricing row   | Complete observed quote: meters, discount, and optional `overrides_json`    |
| Baseline row  | First retained knowledge, not an upstream creation event                    |
| `as_of`       | Upper observation cutoff, not a promise that all processor work is complete |

A `listed` row can mean first appearance, reappearance, or a context change while continuously
listed. The preceding listing row tells those cases apart. Price rows are independent: a context
change need not change the quote, and an unchanged quote need not produce another row.

The quote belongs to the endpoint. Membership in the selected model and the displayed tag come
from listing history, not from today's Catalog row. A provider tag is neither identity nor unique:
several endpoints may share it. See [provider identity](provider-identity.md) and the
[pricing policy](pricing.md#presented-rates-and-overrides).

## Loading flow

1. Subscribe to `v4/history/listings/query:endpoints` for the model's historical UUIDs.
2. For each UUID, subscribe to `listings/query:forEndpoint` and `pricing/query:observe` in parallel.
   Listings are small enough for a complete per-endpoint response. Prices paginate oldest first,
   initially targeting 1,000 rows per page; all loaded pages remain reactive.
3. Subscribe separately to `v4/clock:observe` for the chart horizon. History reads do not depend
   on this moving clock, and neither their arguments nor cache identities contain its value.
4. After all endpoints' pages have loaded, assemble context and quotes chronologically and
   present the selected model's spans through that horizon.

The existing `listings:byModel` query alone cannot provide the lens: a subsequent move to another
model appears under that other model. Historical discovery followed by complete per-endpoint
context includes that boundary without loading unrelated endpoints' listings.

`history-data.tsx` owns subscription mounting, aggregation, and retry, exposing only data/loading/error
state to the view. It uses the existing Convex/TanStack cache for membership, listings, and the clock.
Endpoint prices use `usePaginatedQuery` from `convex-helpers/react/cache` per UUID. The helper
retains page subscriptions and uses a stable pagination ID, allowing reuse across overlay visits
and models. `ConvexQueryCacheProvider` retains up to 250 idle page subscriptions for five minutes
with its default settings. Convex still owns cursors and journals, and the helper handles page
splitting. Query arguments are independent of the selected model and moving horizon. Prices are
cached in memory, not persisted in the TanStack browser cache. Retry remounts the pagination hooks.

Late observations update the relevant subscribed page, including older pages. Immutable rows do
not make observation-time ranges permanently closed. Ordinary additions usually affect only the
newest page. Reactive pages have row/byte read limits so growth can trigger native page splitting
before exceeding response limits. Empty partial pages are followed, and any endpoint error blocks
presentation of a partial chart. The chart's controls survive subscription/page loading.

Subscriptions fix stale committed data; they do not prove processor completeness. The chart's
price board inspects exact observations even when plotted lines use daily sampling.

### Reactive retrieval verification

Dev verification on September 29 covered 8,205 prices across nine pages, late inserts into the
oldest and newest pages at an unchanged observation clock, and page splitting after a historical
burst, with all 9,507 observations assembled uniquely. Closing and reopening GLM-5.3 reused all
40 endpoint pricing queries immediately.

Browser checks also covered empty partial pages, exact price inspection, and chart-control
preservation after an error. Recovery was verified with a successful cached result available
before clicking Retry; this establishes error-boundary reset, not a fresh backend request.
Scoped-reader tests cover historical model moves, exclusion of unrelated listings, pagination
metadata/empty partial pages, read budgets, and error propagation.

## Mapping observations to spans

Maintain each endpoint's availability, model/provider/tag context, and latest quote while walking
the combined observation times. At a shared timestamp, apply the new listing context and quote
together; then decide which span begins or ends there.

| Observation                      | Required behavior                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------ |
| Initial baseline listing/price   | Start retained knowledge at the baseline; invent no earlier span                           |
| New positive price while listed  | Step to the new presented rate                                                             |
| Tag/provider change while listed | Change the span's context; carry the existing quote if no price row arrives                |
| Model move while listed          | End the old membership and begin the new one, carrying the endpoint's quote                |
| Unlisting                        | End availability and clear the quote carried into a future availability period             |
| Reappearance                     | Start a new availability period from its fresh observed quote                              |
| Missing/invalid meter            | Treat that meter as unknown, not as a free price or a carried previous meter               |
| Zero meter                       | Preserve the zero observation; the current chart policy omits it from positive-rate traces |

Each price row is a complete quote, not a per-meter patch. Never carry a missing meter forward
from an older quote. Discounts are already reflected in presented rates; do not apply them again.
The stored overrides describe that historical sample, not today's Catalog pricing.

For chart hit testing, a closed span is half-open: `[start, end)`. Only a still-current span may
include the cutoff itself. UUID remains available when grouping spans by their historical tags,
so distinct quotes sharing a tag can still be represented.

## Implementation and remaining product questions

`data.ts` performs trace assembly, while `history-data.tsx` handles loading.
The mapping composes listings and prices outside the endpoint-only pricing history backend.

Known follow-up work:

- **Recovery from cached errors:** Retry remounts pagination hooks with the same cache identity.
  A cached page error can survive that remount until the subscription updates or expires. Explicit
  fresh-subscription recovery is deferred; this limitation concerns recovery after a query failure.
- **Completeness and baseline:** pending-work inspection is internal, and public history results
  expose neither a completeness marker nor an explicit timeline baseline. Pinning a cutoff bounds
  time but does not prevent older pending work from committing into that range later.

The product handles meter selection, tag grouping, visibility, display scaling, and chart
interaction. Model-membership filtering in pricing retrieval and windowed loading are not
requirements for this demo.

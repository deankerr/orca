# V4 Pricing History: demo scope and mapping

The first V4 product integration is implemented in `apps/web/features/pricing-history/` and
verified against the short dev timeline. V4 queries expose observations; the product assembles
endpoint membership, availability, tags, and quotes over time using the separate modules below.

## Module responsibilities

- **Pricing history backend (`v4/history/pricing/`):** stores and retrieves pricing observations
  by `endpoint_id`. It has no knowledge of model membership or of multiple endpoints being
  grouped under a model. Its query accepts an endpoint UUID, observation cutoff, and pagination
  options; it does not discover endpoints, join listings, or filter prices by model membership.
- **Listings:** supplies the availability and model/provider/tag context lens, shared by pricing
  and stats consumers. The complete small listings dataset is loaded in one query. Pricing
  History is currently its only product consumer, so the selection and join stay local to that
  feature rather than introducing a shared client module.
- **Pricing History product:** uses that lens to select endpoint UUIDs, loads their pricing
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

## Small demo

Use the [short development timeline](v4-development-data.md) beginning September 25, 2026.
Show one model's endpoint availability and presented input/output rates, with historical provider
tags. Include an endpoint removal/reappearance and a context change without a new price.
This is enough to exercise the join; replaying the whole archive is unnecessary.

The chart now consumes V4 context-aware traces, with historical tags and real availability gaps.
Conditional-price visualization, long-range downsampling, and a complete archive can follow once
the core mapping is demonstrated. Zero/missing meters still need distinct handling in the mapping
even if the initial chart retains its positive-price-only display.

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
  A direct use of the V3 trace builder would lose everything after the tag change.

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
multi-page pricing reads including empty partial pages. A dev pricing read forced to one row per
page verified real cursor traversal.

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

1. Load `v4/history/listings/query:lens` and pin its `as_of` for pricing requests.
   The production assessment found only 5,920 listing rows for 2,832 endpoint UUIDs.
2. Build the lens from those observations and select UUIDs associated with the requested model.
3. For each UUID, load `v4/history/pricing/query:list` through the same cutoff, following its
   pagination until complete. This is an endpoint read, independent of model membership.
4. Assemble context and quotes chronologically, then present the selected model's spans.

The existing `listings:byModel` query alone cannot provide the lens: a subsequent move to another
model appears under that other model. Loading all listings includes that boundary naturally,
without per-endpoint listing requests.

`use-history-data.ts` uses the existing Convex/TanStack cache for the reactive listings query.
Endpoint pricing reads run in parallel, following pages sequentially within each endpoint. Their
TanStack query keys contain endpoint UUID and cutoff, not model ID. These are snapshot reads:
they refresh on mount/window focus or retry, and a new cutoff selects new queries. A late pricing
commit below an unchanged cutoff is not a live subscription update; completeness metadata remains
an open follow-up. The chart's price board inspects exact observations even when plotted lines
use daily sampling.

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

## V3 trace builder behavior replaced

The old trace builder closed a trace for every listing row and only started another when it saw
a price row. That produced a false gap for a V4 context change with unchanged pricing. It also
assigned one endpoint-level tag to every historical span. `data.ts` now carries the endpoint's
quote through continuous context changes and assigns each trace its historical tag.

The [production assessment](v4-transition-assessment.md#concrete-chart-incompatibility) reproduces
a March-to-July gap for a DeepInfra tag change. The Morph example above provides the same mapping
problem using only two listing rows and one price row in the short dev timeline.

## Implementation and remaining product questions

`data.ts` performs selection and trace assembly, while `use-history-data.ts` handles loading.
The mapping composes listings and prices outside the endpoint-only pricing history backend.

The remaining retrieval question is:

- **Completeness and baseline:** pending-work inspection is internal, and public history results
  expose neither a completeness marker nor an explicit timeline baseline. Pinning a cutoff bounds
  time but does not prevent older pending work from committing into that range later.

The product handles meter selection, tag grouping, visibility, display scaling, and chart
interaction. Model-membership filtering in pricing retrieval and windowed loading are not
requirements for this demo.

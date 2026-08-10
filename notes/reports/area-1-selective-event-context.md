# Area 1 selective event-context sampling

## Scope

This report examines a smaller change to the existing Area 1 product-database experiment:
retain full event context where it materially improves a historical event, but do not retain the
complete endpoint or model document for every ordinary update.

This is intentionally narrower than a generic changeset store. Area 1 already provides the current
product shape, accepted-crawl policy, deterministic entity events, field-level before/after values,
and product-oriented query paths that existing systems expect. The question is what historical
context each event actually needs.

The sample uses the daily-selected product database at
`.labs-work/databases/2026-08-04T11-44-03Z-daily-selected/products.sqlite`:

| Measurement                  |                Value |
| ---------------------------- | -------------------: |
| Selected crawls              |                  354 |
| First selected crawl         | 2025-08-13 23:12 UTC |
| Last selected crawl          | 2026-08-01 13:30 UTC |
| Entity events                |               12,413 |
| Field changes                |               13,738 |
| Product database file        |               28 MiB |
| `entity_events.context_json` |     13,839,973 bytes |
| Before/after field values    |        861,536 bytes |

The corpus is a daily projection, not every accepted crawl. The payload figures below are JSON-text
lengths before SQLite page and index overhead, not a database-file size forecast.

## Event classes in the sample

For this analysis, endpoint updates are classified from their existing field changes:

- **Pricing-only update:** every changed path begins with `pricing.`.
- **Mixed update:** at least one changed path begins with `pricing.`, with one or more other paths.
- **Non-pricing update:** an update with no changed pricing path.
- **Lifecycle:** baseline, available, or unavailable events for either entity type.

| Event class         |     Events | Existing full-context bytes | Context retained in illustrative compact form |
| ------------------- | ---------: | --------------------------: | --------------------------------------------: |
| Lifecycle           |      4,399 |                   4,840,884 |                                     4,840,884 |
| Pricing-only update |      2,738 |                   3,071,190 |                                       268,667 |
| Mixed update        |        284 |                     324,492 |                                        30,614 |
| Non-pricing update  |      4,992 |                   5,603,407 |                                             0 |
| **Total**           | **12,413** |              **13,839,973** |                                 **5,140,165** |

The illustrative compact form retains:

- the current complete context for lifecycle events;
- the complete post-change endpoint `pricing` object for updates that touch pricing;
- existing field-level before/after values for every update;
- no full context for non-pricing updates.

On JSON payload alone, that is 5,140,165 bytes rather than 13,839,973 bytes: 8,699,808 fewer bytes,
or 62.9% less event-context content. This is a comparison point, not a proposed storage contract.
It excludes possible compact display metadata, additional indexes, compression effects, and any
checkpoint or current-view data.

The pricing-only subset is the clearest result. It currently repeats 3,071,190 bytes of complete
event context. Its post-change pricing objects total 268,667 bytes, a 91.3% reduction for that
context payload while retaining all price components at the event time.

Mixed updates are small in this daily sample, but follow the same pattern: retain the full pricing
object for price rendering and use individual field changes for the unrelated update. Whether they
should retain any more context depends on the paths involved.

## Activity differs across the history

The data was divided into equal-duration early, middle, and recent thirds. The representative
records below are near 30 September 2025, 31 January 2026, and 30 June 2026 respectively.

Pricing was not uniformly dominant in every period:

| Period          | Endpoint update fields | Pricing fields | Pricing share |
| --------------- | ---------------------: | -------------: | ------------: |
| Early           |                  4,210 |          1,027 |         24.4% |
| Middle          |                  4,392 |          3,548 |         80.8% |
| Recent          |                  3,937 |          2,330 |         59.2% |
| **All periods** |             **12,539** |      **6,905** |     **55.1%** |

The middle and recent thirds validate the pricing-heavy workload, while the early third contains
substantial capability and representation activity. A compact representation should not assume
that all historical updates look like the recent pricing workload.

## Pricing updates: a compact rich context

For an endpoint pricing update, the event already has its endpoint id, model slug, provider name,
provider slug, changed path, and before/after field value. The full context additionally contains
the complete endpoint, its embedded display metadata, and a full pricing object.

The complete pricing object is much smaller than the full context in each sampled one-field pricing
update:

| Period | Endpoint                        | Changed value                          | Complete post-change pricing                                          | Full context | Pricing object |
| ------ | ------------------------------- | -------------------------------------- | --------------------------------------------------------------------- | -----------: | -------------: |
| Early  | `z-ai/glm-4.5` via SiliconFlow  | prompt `0.0000005` to `0.0000004`      | prompt, completion, internal reasoning, request, web search, discount |        985 B |          115 B |
| Middle | `z-ai/glm-4.6` via Mancer       | prompt `0.0000004375` to `0.000000425` | prompt, completion, discount                                          |      1,137 B |           61 B |
| Recent | `z-ai/glm-5.1` via DigitalOcean | prompt `0.0000013` to `0.000000975`    | prompt, completion, discount                                          |      1,011 B |           62 B |

For example, the early pricing event occurred at crawl `1759273957579`:

```json
{
  "changed": {
    "path": "pricing.prompt",
    "before": "0.0000005",
    "after": "0.0000004"
  },
  "pricingAfter": {
    "completion": "0.000002",
    "discount": 0,
    "internal_reasoning": "0",
    "prompt": "0.0000004",
    "request": "0",
    "web_search": "0"
  }
}
```

This is enough to present the changed price in the context of the endpoint's other advertised price
components at that crawl. For a before-and-after pricing display, the pre-change pricing object can
be reconstructed from `pricingAfter` and the existing before values for the changed fields. An
alternative would retain both complete pricing objects; that would still be much smaller than a
complete endpoint/model context in this sample.

The sampled endpoint contexts also contain historical model and provider display names. If those
names are needed in a Monitor row and cannot be obtained from a historical model event, a small
display slice could be retained alongside pricing. The existing event columns already retain the
model slug, provider name, and provider slug, so the required addition may be far smaller than the
complete context.

## Lifecycle events: full context has a clear use

Availability transitions need more than a field diff. A new endpoint needs an initial complete
description, and an unavailable endpoint is most useful when shown with the last observed pricing,
capabilities, model variant, and provider display data.

The following endpoint examples illustrate the information carried by a roughly 1 KiB full context:

| Period | Event       | Endpoint                                  | Useful historical information                                                      | Context |
| ------ | ----------- | ----------------------------------------- | ---------------------------------------------------------------------------------- | ------: |
| Early  | Available   | `deepseek/deepseek-v3.2-exp` via GMICloud | permaslug, zero/non-zero prices, and the four supported parameters at introduction | 1,088 B |
| Middle | Unavailable | `moonshotai/kimi-k2.5` via GMICloud       | final `int4` provider variant, advertised prices, and reasoning/tool capabilities  |   962 B |
| Recent | Available   | `anthropic/claude-sonnet-5` via Anthropic | cache-read/write and web-search prices plus the initial capability set             | 1,221 B |

The sample contains 4,399 lifecycle events when baseline events are included. Baselines are a
special case: a full product snapshot or retained checkpoint might make their per-event context
redundant, while retaining it makes each baseline event independently useful. The payload comparison
above conservatively keeps every lifecycle context rather than choosing between those forms.

## Non-pricing updates: field values are sometimes already sufficient

The current Area 1 field comparison treats arrays as whole values. A `supported_parameters` update
therefore already carries complete before and after arrays, rather than a noisy sequence of indexed
operations. The following sampled events can be rendered directly from their field change:

| Period | Endpoint                           | Change represented by the field values                         | Full context retained today |
| ------ | ---------------------------------- | -------------------------------------------------------------- | --------------------------: |
| Early  | `openai/gpt-oss-120b` via GMICloud | Removed `structured_outputs` and `response_format`             |                     1,083 B |
| Middle | `openai/gpt-oss-120b` via Crusoe   | Removed `tools` and `tool_choice` from a larger capability set |                     1,265 B |
| Recent | `rekaai/reka-flash-3` via Reka     | Added `logprobs` and `top_logprobs`                            |                     1,027 B |

The complete before/after arrays remain useful for detailed inspection, but they are already in
`event_fields`. In these cases, retaining the surrounding endpoint document does not add much to
the change itself.

Other non-pricing paths may justify selective additional data. Examples include model description or
promotion changes where a historical display name matters, and changes to a nested configuration
where a full relevant subtree would be clearer than individual leaves. The current sample does not
establish a universal list. It suggests that context can be chosen by event kind or path family
rather than stored uniformly.

## Interpretation

The existing Area 1 representation is already close to a selective model:

- `event_fields` retains the precise change facts;
- `entity_events` retains stable ids and query dimensions;
- `context_json` provides a complete historical display/state payload.

The sampling suggests that `context_json` can be decomposed rather than removed:

| Situation                        | Information that appears useful                                                   | Information that often appears redundant                       |
| -------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Baseline, available, unavailable | Full entity context or an equivalent nearby full snapshot                         | None assumed in this sample                                    |
| Pricing-only update              | Complete post-change pricing plus changed fields; possibly small display metadata | Unchanged endpoint flags, limits, capabilities, and model body |
| Mixed pricing update             | Complete post-change pricing plus the changed non-pricing fields                  | Unchanged endpoint and model body                              |
| Capability array update          | Existing complete before/after array plus stable event identifiers                | Unchanged pricing, limits, flags, and model body               |
| Simple scalar update             | Changed before/after value and, if needed, a small display slice                  | Complete entity context                                        |

This keeps the current database's event semantics and product-query orientation. It also leaves room
to retain extra context for a small number of event types that later prove valuable, without making
that decision for every update up front.

## Limits and follow-up measurements

The sample supports a targeted Area 1 experiment, but not a final storage estimate:

- The data is daily-selected. Full-precision history may change the mix of pricing and lifecycle
  events substantially.
- JSON payload length does not account for SQLite row overhead, indexes, page utilization, or a
  compressed remote representation.
- The report assumes the current field before/after encoding is retained. Removing or changing it
  would alter both reconstruction and display possibilities.
- Historical display metadata needs explicit product decisions. The current context is convenient
  because it contains everything; selective context needs to state what a Monitor row may depend on.
- Baseline handling depends on whether a nearby product checkpoint is independently retained and
  queryable.

Useful next measurements would compare the current database with variants that retain full lifecycle
contexts, pricing snapshots for price-bearing updates, and a few compact display slices. Their
database size, query cost, and Monitor rendering should be compared over the same full and daily
replays before deciding which event kinds warrant extra context.

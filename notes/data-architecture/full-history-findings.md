# Full core-history replay findings

Evidence from the first complete `bun:sqlite` forward replay of the production archive, inspected
2026-08-03. The generated database is disposable; these observations are retained because they
affect processing semantics and product correctness.

Source database: `.archive-work/history/core-history.sqlite`

## Completed replay

The database passed `PRAGMA integrity_check` and spans the complete archive:

| Measurement                 |         Value |
| --------------------------- | ------------: |
| Crawls                      |        19,245 |
| First crawl                 | 1755115660864 |
| Last crawl                  | 1785591004186 |
| Crawls containing events    |         4,898 |
| Failed text endpoint scopes |            81 |
| Current models              |           298 |
| Current text endpoints      |           931 |
| Current metric rows         |           879 |
| Entity events               |        28,926 |
| Field changes               |        22,947 |
| SQLite file size            |         56 MB |

The terminal current-view counts agree with direct materialization of the latest crawl. About three
quarters of captures contain no selected core change.

The raw event totals below are diagnostic, not yet trusted product totals, because the empty-catalog
anomaly described below creates false lifecycle events:

| Entity   | Available | Updated | Unavailable |
| -------- | --------: | ------: | ----------: |
| Model    |     2,178 |   1,160 |       1,880 |
| Endpoint |     6,798 |  11,043 |       5,867 |

## Selected-field changes

The full pass supports the small generic field-event model: pricing dominates, but capability,
limit, policy, and endpoint identity changes are also material.

| Raw core path                  | Changes |
| ------------------------------ | ------: |
| `pricing.prompt`               |   3,665 |
| `pricing.completion`           |   3,267 |
| `supported_parameters`         |   2,835 |
| `pricing.input_cache_read`     |   2,719 |
| `pricing.discount`             |   1,606 |
| `pricing.web_search`           |     947 |
| `pricing.request`              |     891 |
| `pricing.internal_reasoning`   |     884 |
| `data_policy.canPublish`       |     736 |
| `context_length`               |     619 |
| `max_completion_tokens`        |     617 |
| `quantization`                 |     567 |
| `data_policy.retainsPrompts`   |     485 |
| `supports_reasoning`           |     446 |
| `provider_slug`                |     358 |
| `supports_tool_parameters`     |     294 |
| `promotion_message`            |     282 |
| `pricing.input_cache_write`    |     251 |
| `is_deranked`                  |     207 |
| `pricing.input_cache_write_1h` |      76 |

Whether Monitor displays every selected path is a product projection decision. Suppressing a path
from a feed must not delete it from immutable history.

## Empty model catalogs are failed observations

Eight stored crawl bundles contain a completely empty model catalog while retaining 72 providers:

```text
models:    0
endpoints: 0
providers: 72
```

They occur in five outage periods:

| First crawl   | Last crawl    | Count | UTC interval           |
| ------------- | ------------- | ----: | ---------------------- |
| 1779471000145 | 1779472200112 |     2 | 2026-05-22 17:30–17:50 |
| 1779474600131 | 1779475800130 |     2 | 2026-05-22 18:30–18:50 |
| 1779480600116 | 1779480600116 |     1 | 2026-05-22 20:10       |
| 1779527400153 | 1779527400153 |     1 | 2026-05-23 09:10       |
| 1779533400134 | 1779534600135 |     2 | 2026-05-23 10:50–11:10 |

The initial replay treats each first empty crawl as complete catalog removal and each recovery as
catalog rediscovery. A representative transition emits 839 endpoint and 318 model lifecycle events:
1,157 false events in one crawl. These bursts account for a substantial fraction of the raw event
totals.

This behavior is wrong for every consumer:

- Monitor receives whole-catalog disappearance/recovery floods.
- Pricing History receives false unavailable intervals for every endpoint.
- A live Alerts processor could broadcast catastrophic false removals.
- The terminal Grid/API view happens to recover, hiding the historical corruption.

### Required processing rule

An empty model catalog is an invalid catalog observation, not an empty effective state:

```text
raw crawl with models.length === 0
    -> retain raw artifact and record anomaly
    -> carry previous models, endpoints, and metrics forward
    -> emit no entity events
```

If the first replay crawl is empty, processing must fail because no valid baseline exists. Do not
yet infer a percentage-drop threshold for nonempty catalogs; record observed counts so partial-crawl
hypotheses can be evaluated from evidence.

The crawl ledger should retain at least:

```ts
type ProcessedCrawl = {
  crawlId: string
  previousCrawlId?: string
  catalogStatus: 'accepted' | 'empty'
  observedModelScopes: number
  observedEndpoints: number
  failedEndpointScopes: number
  emittedEvents: number
}
```

After implementing this rule, rebuild the entire history before using lifecycle counts or product
history as evidence.

## Query and context findings

- Existing crawl, model+crawl, and provider+crawl indexes support Monitor pagination without
  scanning the events table.
- Pricing History can select lifecycle events and opted-in pricing paths through the model+crawl and
  event-field primary-key indexes. Final ordering currently uses a temporary B-tree; this is
  acceptable until measured reads say otherwise.
- Endpoint event context contains period-valid endpoint/provider values but only an indexed
  `model_slug`. Looking up the latest model would repeat the legacy historical-enrichment bug.
  Endpoint events need a period-valid model reference, at least `{ slug, name }`.
- Provider fields should remain endpoint context. The corpus does not establish one stable provider
  identity suitable for foundational provider lifecycle events.

## Next proof

1. Treat empty catalogs as rejected observations and expand the crawl ledger.
2. Add period-valid model context to endpoint events.
3. Rebuild all 19,245 crawls and compare the corrected event distribution.
4. Exercise [product-queries.md](product-queries.md) against the corrected history.

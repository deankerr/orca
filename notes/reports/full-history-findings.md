# Full core-history replay findings

## Completed replay

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

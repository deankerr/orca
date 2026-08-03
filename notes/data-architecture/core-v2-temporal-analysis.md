# Core v2 temporal analysis

This analysis uses the complete `core-v2.sqlite` replay: 19,207 accepted crawls from 13 August
2025 through 1 August 2026, 17,337 entity events, and 22,942 field changes. The first crawl is a
baseline materialization, not a change burst, and is excluded where a ranking would otherwise treat
its 999 `available` events as market activity.

## Capture cadence

Capture frequency changed twice during the period:

| Period               |                Median interval | Typical captures per complete day |
| -------------------- | -----------------------------: | --------------------------------: |
| August–November 2025 |                     60 minutes |                                24 |
| December 2025        | transitional; 20-minute median |                                45 |
| January–July 2026    |                     20 minutes |                             71–72 |

Across the whole corpus the median interval is 20.0 minutes, p90 is 59.4 minutes, and p99 is 62.7
minutes. The distribution mostly describes the planned cadence changes rather than instability.
Only two gaps are materially exceptional:

- 13.1 hours from 24 November 13:12 UTC to 25 November 02:15 UTC.
- 8.7 hours on 9 June from 07:10 UTC to 15:50 UTC.

Consequently, raw events per crawl and the percentage of crawls containing a change are not safely
comparable across the whole year. Daily rates are the more useful temporal measure.

## Activity over time

| Month   | Captures/day | Changed crawls | Events/day | Field changes/day | Pricing fields/day |
| ------- | -----------: | -------------: | ---------: | ----------------: | -----------------: |
| 2025-08 |         23.1 |          21.7% |      110.7 |              67.0 |                5.9 |
| 2025-09 |         24.0 |          28.0% |       35.4 |              36.9 |               11.9 |
| 2025-10 |         24.0 |          36.6% |       69.3 |              69.2 |                8.6 |
| 2025-11 |         23.6 |          26.0% |       20.8 |              19.4 |                8.6 |
| 2025-12 |         44.8 |          15.3% |       28.1 |              27.9 |               11.0 |
| 2026-01 |         71.8 |          12.9% |       61.6 |             119.8 |              100.3 |
| 2026-02 |         72.0 |          12.9% |       29.3 |              24.9 |               13.4 |
| 2026-03 |         71.7 |          14.8% |       25.5 |              21.1 |               10.6 |
| 2026-04 |         71.8 |          19.6% |       33.3 |              29.7 |               13.2 |
| 2026-05 |         71.0 |          23.5% |       35.1 |              34.4 |               20.0 |
| 2026-06 |         70.8 |          32.9% |       66.1 |              75.8 |               35.9 |
| 2026-07 |         71.7 |          62.1% |       94.3 |             246.0 |              226.6 |

August 2025 is inflated by the initial 999-event baseline. October, January, June, and July contain
real clusters, but the largest clusters have different meanings and should not be read as one
generic kind of market volatility.

## Hotspots and reporting discontinuities

The highest-volume non-baseline crawls are dominated by a single field family:

- **18 August 2025, 731 events:** `data_policy.canPublish` changed on all 731 endpoints, with related
  retention fields on subsets. This looks like an upstream reporting/schema transition.
- **23 October 2025, 305 events:** 301 endpoint `quantization` changes. Other crawls that day produce
  800 total events, making it the largest non-baseline event day.
- **17 September 2025, 267 events:** another broad single-crawl update cluster rather than endpoint
  lifecycle churn.
- **16 December 2025, 215 events:** a broad update coincident with the capture-cadence transition.
- **25–27 January 2026:** 2,101 pricing field changes across three days. Most of the dominant changes
  remove zero-valued `pricing.internal_reasoning`, `pricing.request`, and `pricing.web_search`
  properties. This is mainly a representation cleanup, not 2,101 independent price movements.
- **17 June 2026, 148 events:** 147 `supported_parameters` updates. The full day contains 424 events.

These clusters demonstrate why immutable raw paths are useful: a product feed can suppress or group
known bulk rewrites without erasing the evidence needed to understand them.

## The July pricing surge

July's activity is qualitatively different but also highly concentrated:

- `z-ai/glm-5.2` accounts for 1,533 of 2,924 July events (52.4%).
- It accounts for 5,671 of 7,024 July pricing field changes (80.7%).
- Across its 45.8-day observed span it has 1,658 events on 1,213 distinct crawls: 36.2 events per
  day, far above every other model.
- Novita contributes 2,776 GLM 5.2 pricing field changes across 694 crawls; StreamLake contributes
  2,643 across 681 crawls.
- The dominant paths are prompt, completion, cache-read pricing, and discount values changing by
  small increments. This is consistent with dynamic provider pricing rather than lifecycle churn.

The next-highest models have far lower event rates: `deepseek/deepseek-v4-flash` has 2.4 events/day,
`deepseek/deepseek-v4-pro` 2.3, and `moonshotai/kimi-k2.6` 2.1. GLM 5.2 should therefore be treated
as its own high-frequency pricing workload when evaluating chart coalescing, Monitor presentation,
and future remote query costs.

## Product implications

1. Report capture cadence alongside change counts, and prefer daily normalization for long-range
   comparisons.
2. Classify or annotate bulk same-path rewrites at read time; do not delete them from durable event
   history.
3. Pricing History needs configurable granularity. Hundreds of tiny points from one provider are
   correct evidence but not automatically useful chart resolution.
4. Monitor should be able to group a crawl-wide rewrite and distinguish it from availability churn.
5. Query and storage benchmarks should include GLM 5.2 as the high-frequency case rather than rely
   only on median model histories.

# Pricing-history research — second pass

This file is now an index. The first-pass report, scripts, aggregates and figures have been replaced.
The frozen source export is retained as evidence; all derived data uses the revised domain rules.
Snapshot: **September 8, 2026, 19:40 UTC**. Start with the method when interpreting any number.

| Topic                                                    | What it establishes                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [Method and domain facts](methods.md)                    | Unmetered equivalence, Lyria exclusion, schedule exclusion, populations, source limits and reproduction |
| [Cache-read metering](cache-metering.md)                 | Requested historical percentage, catalog turnover, first-observed cohorts and investigated jumps        |
| [Population and activity](activity.md)                   | Rebuilt model/provider concentration, ages, schedules and exposure-adjusted activity                    |
| [Meter ratios](ratios.md)                                | Co-movement within endpoints versus ranking differences across providers                                |
| [Reporting changes and anomalies](reporting.md)          | Meaningless representation churn, reviewed schema episodes and unresolved reversals                     |
| [Provider identity](identity.md)                         | User-facing choices, duplicate UUIDs and the limits of historical tag evidence                          |
| [Timeline detail](timeline-detail.md)                    | All-provider step histories and measured consequences of coarser time resolution                        |
| [Model families and chart usefulness](model-families.md) | Current family tags, major-lab shares, quiet-history prevalence and age-controlled comparisons          |

Key second-pass results:

- The three major-lab families are **35.9% of current model IDs and 30.5% of endpoints**, but only
  **1.7% of current models’ recent changes**. **52.0% of current models** have a full 30-day window
  with no input-price changes, no scheduled span, and only one or two observed input-price levels.

- Cache-read metering rises from **12.9% to 73.4%** of the endpoints listed at each time. Catalog
  turnover accounts for much of the growth; this is not a measure of caching support or usage.
- **2,135** recent changes remain after normalization and exclusions; Baidu and StreamLake supply
  **64.8%**. All 350 continuous observations involving declared schedules are excluded from counts.
- Activity per listed endpoint is almost flat from August to partial September despite higher daily totals.
- **83.2%** of eligible recent core-meter transitions preserve ratios exactly. Provider rankings still
  differ across meters, especially cache read.
- **17.2%** of changing, complete unscheduled endpoint-days finish at their opening price. Coarsening
  has measurable costs, but the data does not prescribe a single resolution or retention horizon.

All eight figures are regenerated and embedded in their topic notes. The [data dictionary](methods.md#data-dictionary)
links the conceptual questions to reproducible CSV outputs. Future corrections belong in the rules
and affected topics, followed by regeneration—not an addendum leaving obsolete claims in place.

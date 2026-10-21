# Pricing-history population and query costs

How are retained histories distributed across endpoints and models, and what do query strategies cost on the largest model?

## Scope

- Population collected 2026-10-13; endpoint counts checked 2026-10-13; aggregate query costs measured 2026-10-14.
- Source: production `dependable-husky-550`, through scan `2026-10-13T15:40:43.170Z`, using Convex CLI 1.45.0.
- Histories begin at retained baseline `2025-08-13T20:19:21.211Z`; this does not establish complete source coverage.
- Table reads exhausted pagination and shared an unchanged ingestion horizon; they were not an atomic snapshot.
- Legacy listing rows supplied context; aggregate experiments also mapped them to an endpoint-observation shape.
- Raw inputs and the deployed schema revision were not retained; table names, hashes, and queries were retained.

## Observations

| Measurement                          | Entities | p50 | p99 | Maximum |
| ------------------------------------ | -------: | --: | --: | ------: |
| Listing rows per endpoint            |    2,973 |   2 |   7 |      19 |
| Price rows per endpoint              |    2,973 |   3 | 109 |     580 |
| Historical endpoints per model       |      842 |   1 |  31 |      58 |
| Full endpoint listing rows per model |      842 |   3 |  75 |     138 |
| Full endpoint price rows per model   |      842 |   4 | 655 |   2,103 |

- Totals: 6,329 listing rows and 19,800 price rows; 1,370 endpoints remained listed across 433 models.
- Price histories had at most five rows for 2,492 endpoints; 34 endpoints had more than 100 rows.
- Ten models accounted for 54.5% of physical price rows; `z-ai/glm-5.2` had 58 endpoints and 2,103 prices.
- On that model, context and price aggregates read 270 and 2,238 documents, returning 28,429 and 397,730 Convex bytes.

## Interpretation and detail

- Model populations exclude 184 catalog models without retained listings; `listed-models` requires a listed endpoint.
- Full model histories count each historically associated endpoint's entire history, including time under other models.
- Membership changes overlap model totals: 2,992 memberships, 6,392 listing rows, and 19,858 price rows.
- `price_rows_during_membership` attributes each quote using its context at that timestamp, avoiding that overlap.
- Text steps count positive Input/Output changes during continuous listing, excluding simultaneous context boundaries.
- Initial quotes, reappearances, zero/missing rates, and changes only to other meters do not count as text steps.
- Whole-history counts measure retained volume; they are not change rates normalized by endpoint lifetime or exposure.
- `source.csv` defines counting conventions; `source-tables.csv` records downloaded table sizes, ranges, and hashes.
- `distributions.csv` summarizes populations; `frequencies/<population>/<metric>.csv` retains exact value counts.
- Absent frequency values mean zero entities; `daily.csv` missing dates do not establish upstream availability.
- `outlier-*.csv` deduplicates the original top-20 selections; it is not a full endpoint/model inventory.
- `concentration.csv`, `population.csv`, `integrity.csv`, and `text-step-examples.csv` retain supporting calculations.
- `glm-endpoints.csv` records the full outlier membership; `experiment-source.csv` dates the follow-up reads.
- `capacity.csv` and `transaction-metrics.csv` are measured; `strategies.csv` and `pagination.csv` contain calculations.
- `experiments.py` defines assumptions and queries; `limits.csv` records the limits checked on 2026-10-14.
- Source collection counts differ from runtime query accounting; JSON sizes differ from Convex sizes and wire traffic.
- CSVs have headers; booleans use true/false, empty cells mean absent values, and nested lists/maps use JSON cells.

## Repeat the method

Run from the repository root with an explicit deployment and a new output path:

```sh
python3 docs/evidence/2026-10-13-pricing-history/analyze.py --deployment dependable-husky-550 --output /tmp/history-study
python3 docs/evidence/2026-10-13-pricing-history/experiments.py compare --output /tmp/history-comparison
python3 docs/evidence/2026-10-13-pricing-history/experiments.py capture prices --deployment dependable-husky-550 --output /tmp/history-prices.json
```

- `analyze.py` reads the legacy tables into memory; `compare` is offline; `capture` runs one read-only historical query.
- Repeating collection measures then-retained data; historical inputs and future schema compatibility are not assured.

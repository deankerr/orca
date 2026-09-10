# Research method and domain facts

This is the replacement, second-pass study of the frozen dev export through **2026-09-08
19:40:04.163 UTC**. Topic notes are indexed in [report.md](report.md). All derived CSVs and figures
were regenerated. No first-pass narrative or derived dataset remains in this research directory.

## Established domain facts

These facts come from Dean's direct experience operating ORCA and observing OpenRouter, clarified
in this research conversation. They are inputs to the analysis, not hypotheses inferred from counts.
The durable pricing rules are also recorded in [the OpenRouter knowledge base](../../../docs/openrouter/pricing.md).

- **Zero and undefined/absent meter values are equivalent: unmetered.** A zero/absent transition
  is meaningless for pricing analysis. Neither state determines feature support or whether an
  endpoint is free. Original syntax is retained only as source/audit evidence.
- **Lyria Clip and Pro are outside this research population.** Their songs include text lyrics,
  which lets them pass the text-input/text-output modality filter. Exclude
  `google/lyria-3-clip-preview` and `google/lyria-3-pro-preview` for that reason, not because of their
  prices or because all audio-capable models should be excluded. No backend filter was implemented.
- **Schedule pricing is not ordinary repricing.** Detect it only when an object in `overrides`
  has a property starting with `utc_`. Do not derive a base price, choose a default band, parse
  schedule contents, or treat active-band movement as a pricing change.
- **Snapshots include OpenRouter mistakes and reporting changes.** A spike must be investigated;
  neither a large batch nor a rapid reversal alone proves a bug or a real commercial change.
- **The landscape has changed during collection.** Meter prevalence is not a timeless provider
  characteristic. Caching, web search and other conventions expanded beyond their earlier scope.
  Pricing records alone do not provide a history of tool/structured-output capabilities.
- **UUIDs are internal research keys, not user choices.** Model plus provider tag is the meaningful
  user-facing identity. Tags are opaque; do not infer quality, capabilities, regions or lineage from
  their text. The rare same-tag collisions do not justify exposing UUIDs in product UX.

## Source and population

The untouched source JSONL and `manifest.json` preserve the original export, not the old analysis.
Deleting or normalizing source evidence would prevent us from checking mistakes and revised rules.
`export.py` is a read-only exporter; `summary.json` records SHA-256 hashes of all five source files.

| Population                                |          Count |
| ----------------------------------------- | -------------: |
| Raw endpoint records / pricing rows       | 2,645 / 12,000 |
| After Lyria exclusion                     | 2,643 / 11,998 |
| Currently listed endpoints / models       |    1,267 / 410 |
| Current model + provider-tag choices      |          1,257 |
| Deep-research models / endpoint histories |    480 / 2,198 |

Current means no `unlisted_at`, consistent with the final listing transition. The deep cohort
contains models listed now or whose last endpoint disappeared within 60 days of the export clock.
Recent behavior uses that cohort. Historical catalog percentages and historical spike inspection use
all endpoints listed at the historical time, including subsequently retired models. This deliberate
exception prevents survivor bias in longitudinal population statistics.

First retained observation is August 13, 2025. First observation is not necessarily launch. Ages use
upstream creation timestamps where available; observed ages have a collection-start ceiling. Provider
tags and organization names come from latest retained endpoint metadata, so historical tag renames
cannot be established from this export.

## Interpretation of each observation

Exact decimal values are parsed with Python `Decimal` (precision 100). Meter zeros are removed from
the effective map; absence therefore compares equal to zero. The export contains no negative or
nonfinite meter values; the analysis fails if that assumption stops holding. Discounts are already
reflected in normalized prices and are never applied again.

Classification is mutually exclusive, in this order:

1. **Initial:** first pricing observation for an endpoint; not a change.
2. **Relisted:** first observation in a new listing episode; not a continuous change.
3. **Scheduled excluded:** either side of the transition has a `utc_*` override. Including the
   entry/exit boundary is a conservative analytical choice; it avoids attributing a band transition
   to repricing. Even an override edit remains excluded under this deliberately coarse rule.
4. **Unmetered equivalent:** effective meter maps are equal but raw maps differ. In this export all
   2,147 such observations are zero-field representation differences, not nonzero formatting changes.
5. **Metadata only:** effective meters are unchanged; discounts/overrides may have changed.
6. **Reporting excluded:** a specifically reviewed January reporting pattern; see [reporting.md](reporting.md).
7. **Counted:** another effective meter change. Count once per endpoint observation, even when many
   meters change. This includes nonzero metering additions/removals as well as changed rates.

“Counted change” means an unscheduled, normalized observed change after these exclusions. It is not
proof of a change to real billing. Unresolved reversals remain visible and counted; hiding them would
invent certainty. All classes survive in `events.csv`; counterfactual totals can be reconstructed.
These classifications govern change counts, not whether a historical quoted state is retained.

## Time and denominators

- Recent means the trailing 30 × 24 hours ending at the export clock, not 30 calendar dates.
- State is carried forward only within a listing episode. Unlisted intervals remain gaps. Observation
  time is when ORCA detected a state, not a claim about the precise upstream effective time.
- Daily prevalence uses the initial observation, each subsequent UTC midnight, and the final export
  clock. At each sample, reconstruct listed endpoints and their latest pricing state. The denominator
  is endpoints, including unmetered/free and scheduled endpoints; the numerator is a nonzero meter.
- The cache population bridge exactly reconciles adjacent **samples**. “Continuing” means present
  at both samples; intraday exits, returns and reversals can be hidden. Its net contributions describe
  the sampled series, not exact counts of all underlying events or causal percentage-point effects.
- The 148-endpoint fixed cohort was continuously listed from first observation through the export.
  It illustrates selection effects and is explicitly survivor-selected, not an unbiased adoption rate.
- Monthly activity uses exact listing-duration exposure; first and final months are partial. Per-100
  endpoint-day rates use all listed exposure, while scheduled transitions are excluded from numerator.
- Imported history does not enumerate every historical scan. Do not infer scan completeness from
  pricing-row density, nor equate zero observed changes with proof of no intrainterval changes.

## Ratios, collisions and temporal detail

Core meters are prompt, completion and cache read. Compare ratios only when core membership is
unchanged and at least one positive meter/prompt pair exists on both sides of a counted transition.
Cross-products test exact proportionality; maximum relative ratio drift governs each event. One basis
point is a diagnostic tolerance, not permission to erase small changes.

Current provider ranking comparisons collapse identical effective meter maps for duplicate model/tag
UUIDs and exclude conflicting maps. They compare unequal-input-price pairs for inversions in output
or cache ordering. Current scheduled quotes are valid as-of comparisons, not inferred base rates.

Daily-resolution diagnostics use complete UTC days wholly inside the recent window, continuous
listing coverage, positive prompt metering, and no scheduled span. Only days with more than one
prompt value enter the information-loss denominator. “Close” is the last quote before the next
midnight. Means are time-weighted quote averages, not transaction-weighted customer costs.

## Reproduction and updates

```sh
python3 -B notes/pricing-history/research-2026-09-09/families.py
MPLCONFIGDIR=/private/tmp/orca-pricing-matplotlib /private/tmp/orca-pricing-research-venv/bin/python notes/pricing-history/research-2026-09-09/plot.py
MPLCONFIGDIR=/private/tmp/orca-pricing-matplotlib /private/tmp/orca-pricing-research-venv/bin/python notes/pricing-history/research-2026-09-09/plot_families.py
python3 -B notes/pricing-history/research-2026-09-09/verify.py
bun run fix
```

`families.py` regenerates the base analysis by importing `analyze.py`, then builds the family tags
and comparisons. The family topic uses only currently listed models, so its recent change total is
2,128 rather than the deep cohort’s 2,135. See [model-families.md](model-families.md) for that scope,
complete-window controls, and the distinction between family tags and license verification.

Analysis uses only the Python standard library. Plotting uses Matplotlib; the temporary environment
path above is the one used for this pass. `export.py` refreshes source data only when deliberately run.
When facts or source data change, revise the rules, regenerate all derived files, inspect flagged
batches and rendered figures, and update the affected topic notes. Narrative interpretations require
review; do not treat a successful script run as validating old prose against a new snapshot.

## Data dictionary

Normalized meter columns use an empty CSV cell for unmetered. Raw audit columns preserve literal zero
and absence separately so the ignored upstream representation can be inspected.

| Dataset                                                                        | Row and purpose                                                                            |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `observations.csv`                                                             | Endpoint × pricing observation; effective meters plus raw JSON and opaque overrides        |
| `events.csv`                                                                   | Observation classification, exact core before/after values, ratio and schedule flags       |
| `raw_meter_edits.csv`                                                          | Raw per-meter differences; effective-difference flag identifies meaningless syntax changes |
| `listing_intervals.csv`, `segments.csv`                                        | Listing episodes and price-state intervals, with gaps and schedule flags                   |
| `endpoints.csv`, `models.csv`, `organizations.csv`                             | Population, ages and rebuilt recent behavior aggregates                                    |
| `meter_frequencies.csv`                                                        | Current metered versus unmetered counts                                                    |
| `meter_history_daily.csv`                                                      | Historical population and each meter's nonzero count/percentage                            |
| `cache_population_bridge_daily.csv`                                            | Reconciled entry/exit and same-endpoint contributions between samples                      |
| `cache_transitions_daily.csv`                                                  | Identity of endpoints changing cache-meter status between adjacent samples                 |
| `cache_by_organization_monthly.csv`                                            | Historical organization-level cache prevalence                                             |
| `cache_first_observed_cohorts.csv`                                             | Cache metering at first observation, grouped by month                                      |
| `current_ratios.csv`, `cross_meter_rankings.csv`                               | Meter ratios and provider-ranking inversions                                               |
| `identity_reuse.csv`, `current_collisions.csv`                                 | Multiple UUIDs per tag and current effective-pricing conflicts                             |
| `observation_batches.csv`, `large_batch_evidence.csv`                          | Timestamp × organization activity; factors and reversals for every counted batch ≥10       |
| `monthly.csv`                                                                  | Classified monthly observations and exposure-adjusted change rates                         |
| `daily_resolution.csv`                                                         | Complete unscheduled endpoint-days with intraday prompt movement                           |
| `variant_history_daily.csv`                                                    | Daily cache prevalence within each explicit latest variant label                           |
| `meter_population_bridge_daily.csv`                                            | Daily entry/exit versus continuing-endpoint changes for search and cache-write meters      |
| `model_family_activity.csv`, `current_endpoint_families.csv`                   | Explicit family/cohort tags and per-model/endpoint activity; complete-window controls      |
| `cohort_activity.csv`, `family_activity.csv`, `family_change_distribution.csv` | Current-model family comparisons, shares and distributions for multiple windows            |
| `major_lab_change_events.csv`, `major_lab_provider_counts.csv`                 | Inspected major-lab changes and current serving organizations                              |

The local [OpenRouter docs](../../../docs/openrouter/) supply field context. The user-provided facts
above supersede earlier research assumptions. No external market claims are inferred from model names.

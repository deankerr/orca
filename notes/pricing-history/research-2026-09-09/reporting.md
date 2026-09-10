# Reporting changes, spikes and unresolved reversals

**An upstream observation is not automatically a pricing change.** Apply established domain semantics
first, inspect coordinated changes second, and preserve unresolved observations rather than labeling
all large batches commercial decisions or all reversals bugs.

The second-pass classification of 11,998 scoped pricing rows is:

| Class                               | Observations | Counts as a change?                |
| ----------------------------------- | -----------: | ---------------------------------- |
| Initial                             |        2,643 | No                                 |
| Relisted                            |          472 | No                                 |
| Unmetered-equivalent representation |        2,147 | No                                 |
| Scheduled state involved            |          350 | No                                 |
| Metadata only                       |          140 | No                                 |
| Reviewed January reporting pattern  |          135 | Excluded by the review rules below |
| Other effective meter change        |        6,111 | Yes, as an observed change         |

The first four exclusions follow the cohort/event definitions and Dean's established domain facts.
The January adjudications are narrower analytical judgments, deliberately separate and auditable.
They are not a claim that all remaining observations are genuine billing changes.

## August 2025: no economic event remains in the two mass spikes

At August 23, 02:12:28.177 UTC, 728 endpoint observations remove zero-valued `audio`. At August 26,
03:11:08.780 UTC, 741 add zero-valued `image_output`. Under the established zero/absent equivalence,
these 1,469 observations contribute **zero pricing changes**. They do not describe feature changes.
This follows the domain rule directly; no probabilistic “looks like noise” heuristic is needed.

August's rebuilt total is 68 counted changes in the partial collection month. Raw syntax differences
remain inspectable in the audit CSV but no longer enter meter prevalence or pricing-activity totals.

## January 2026: normalization is necessary but not sufficient

January contains 647 continuous observations that only alter zero-field representation. The
remaining reporting rollout is more involved:

- On January 14, two OpenAI search-preview endpoints remove positive `request` prices and set
  `web_search` to exactly the same amounts, `0.0275` and `0.035`. Prompt/completion stay unchanged.
- Google/Google AI Studio revise the image, reasoning, audio-cache and cache-write representation
  on January 22–23, including intermediate rollbacks and corrections.
- Standalone positive image quotes disappear during the January 12–27 provider rollout, often
  leaving all other effective meter values unchanged.

Gemini 2.5 Flash on `google-ai-studio` illustrates the second case. Prompt stays `0.0000003` and
completion `0.0000025`, while image changes from `0.0012384` to `0.0000003`, and reasoning from
unmetered to `0.0000025`. The old meter layout returns at 20:50 on January 22, the new one returns at
21:50, and audio-cache pricing returns at 22:50 with a different value. The observed image factor is
4,128; interpreting that as a huge economic price cut would be an unsupported assumption about
historical billing units.

The executable review rules exclude 135 observations from the headline historical activity count:

| Rule                                | Scope                                                                                               | Observations |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- | -----------: |
| Search-charge reassignment          | OpenAI, Jan 14, old positive request equals new web-search rate                                     |            2 |
| Google reporting/correction episode | Google or Google AI Studio, Jan 22–23, edits to image/image_token/reasoning/audio-cache/cache-write |           87 |
| Standalone image quote removed      | Jan 12–27, image is the only effective meter difference, positive → unmetered                       |           46 |

These rules do **not** rewrite the observed values or meter-prevalence history. They do **not** erase
all January activity, nor infer feature availability. The image-removal and Google rules are review
judgments that should be revisited if billing evidence becomes available. They live in
`reporting_reason()` and are exposed in every event row, rather than being an undocumented month-wide
filter. Removing these judgments would give 428 normalized unscheduled January changes instead of
293; neither affects the recent 30-day results. Further positive cache or search changes during the
same rollout remain counted unless they meet a stated rule.

## The largest remaining batches were inspected too

`large_batch_evidence.csv` contains every timestamp/organization batch with at least ten counted
observations: **34 batches**. For each, the investigation checks affected meters, prompt factors,
cache ratios, discount co-changes and whether complete prior effective meters return within 24 hours.
This threshold scopes a batch review, not an automatic exclusion rule or a guarantee of finding every
anomaly. Smaller batches and cross-provider events remain in `observation_batches.csv`.

| Pattern                          | Evidence                                                                                                                  | Treatment                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Novita coordinated pricing       | Nov 24: 49 endpoints ×0.8 prompt; Jan 1: 50 ×1.25; discount field unchanged                                               | Counted; consistent with a coordinated price adjustment, without claiming commercial intent |
| Novita temporary reversal        | Dec 30: eleven of thirteen affected endpoints return to prior meters within 24h                                           | Counted, unresolved correction versus temporary pricing                                     |
| Chutes repricing batches         | Sep 10/16 and Oct 3 contain heterogeneous prompt factors                                                                  | Counted; magnitude alone does not establish error                                           |
| Cache-rate publication           | Fireworks, AtlasCloud, Chutes, Mistral, Parasail, DigitalOcean; unchanged prompt/completion in cited batches              | Counted nonzero metering changes; not inferred feature launches                             |
| One-hour cache-write publication | Jun 26 across Google, Amazon Bedrock and Anthropic                                                                        | Counted new metering convention                                                             |
| StreamLake transient unmetering  | Jun 25, 18 endpoints change; all return to prior effective meters within 24h; discount co-changes                         | Counted and unresolved; do not infer free service from unmetered fields                     |
| GMICloud discount reversals      | Aug 27, 18:30: fourteen endpoints change and all return by the next hourly observation; other August batches also reverse | Counted and unresolved; no `utc_*` declaration authorizes schedule exclusion                |
| Alibaba changes                  | Feb/Mar discounts, Apr cache-write edits, Jul mixed movements and reversals                                               | Counted; price and representation explanations remain separable                             |
| Web-search batches               | Google/Google AI Studio Apr 21, Azure May 20, xAI Jan 26                                                                  | Counted metering edits; not inferred changes to search capability                           |

A rapid return is evidence of a transient observation, not proof of a mistake. This distinction is
especially important for the real discount battles the product is meant to reveal. The reviewed
batch evidence also includes January Google cache-write edits and the mixed Google image/search
batch not covered by the narrower reporting exclusions.

## What changed in the research workflow

Zero/absent churn is eliminated at comparison time, not explained away after drawing a spike.
Scheduled observations are separated before ranking volatile endpoints or measuring proportionality.
Reporting judgments are explicit, scoped and reversible. Unresolved observations stay available for
future evidence, with no invented explanation in the headline claims.

Sources: [all classes](data/events.csv), [raw differences](data/raw_meter_edits.csv),
[all timestamp/provider batches](data/observation_batches.csv), [large-batch evidence](data/large_batch_evidence.csv),
[monthly totals](data/monthly.csv), [methods](methods.md).

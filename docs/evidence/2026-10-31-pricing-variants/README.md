# Pricing variants

What pricing shapes does the retained scan contain, and can `pricing.overrides` be parsed reliably?

- **Input:** `../2026-10-28-scan-study/scan.2026-10-27T23:40:40.374Z.jsonl.gz`, one capture at
  2026-10-27T23:40:40.374Z. It is retained, so `analyze.py` reproduces every count here.
- **Population:** all 1,750 endpoints across 662 models. 1,484 endpoints on 435 models are the
  in-scope text population, which holds every override carrier and all 17 outside-`overrides` endpoints.
- **Limit:** one capture shows what existed at that moment, not the full history of upstream shapes.

`analyze.py` asserts the reconciliations below.

| File                        | Contents                                                              |
| --------------------------- | --------------------------------------------------------------------- |
| `override-shapes.csv`       | Each condition and rate-meter key set, with row and endpoint counts   |
| `conditional-endpoints.csv` | The 243 endpoints with conditional pricing in any representation      |
| `meters.csv`                | Each `pricing` meter, with all, text, and zero-valued endpoint counts |

## `pricing.overrides`

226 endpoints carry 247 rows. Every row has a recognised condition, and no array mixes the two
classes, so the classes partition the 226.

| Class         | Conditions                         | Rows | Endpoints | Providers                |
| ------------- | ---------------------------------- | ---: | --------: | ------------------------ |
| Prompt length | `min_prompt_tokens`                |  219 |       216 | 11 upstream prefixes     |
| Schedule      | `utc_start`, `utc_end`             |   16 |         8 | Alibaba, Tencent         |
| Schedule      | `utc_days`, `utc_start`, `utc_end` |   10 |         2 | DeepSeek                 |
| Schedule      | `utc_days`                         |    2 |         2 | DeepSeek, same endpoints |

- 213 prompt-length endpoints have one row and three have two, so three brackets is the maximum.
- Thresholds are 32K, 100K, 128K, 200K, 256K, and 272K; 272K (139 rows) and 200K (51) dominate.
- Every source threshold in `pricing_json` and every `Input Price` display tier matches the overrides.
- No prompt-length row lowers a rate. The largest prompt multiple is 6.67×, on `qwen/qwen3.7-flash`.
- Rows omit meters. `web_search` is omitted from 201 rows; Gemini omits `image` (12) and
  `input_cache_write` (11), and display tiers confirm those rates do not change.
- `internal_reasoning` is omitted from 12 Gemini rows although `reasoning_tokens_high_context` raises it.
  Omission therefore does not always mean the base rate applies.
- The active schedule row matches the current `prompt` and `completion` on all 10 schedule endpoints.
  `utc_end: 0` must mean midnight for that to hold.
- The two DeepSeek arrays have six rows but two price bands, because schedule rows repeat rates.

⚠️ None of the 226 carries a discount, so the scan cannot show whether override rates include one.

## Conditional pricing outside `overrides`

The 2026-10-28 listing's 233 long-context endpoints are the 216 above plus 17 without overrides.

| Endpoints | Source signal                                                  | Display tiers |
| --------: | -------------------------------------------------------------- | ------------- |
|        13 | Gemini `cache_read_*_high_context` only; no threshold          | None          |
|         2 | `google/gemini-3-pro-image-preview`; full meters, no threshold | None          |
|         1 | `minimax/minimax-m3` on GMICloud; threshold 512,000            | None          |
|         1 | `tencent/hy3-preview` on GMICloud; thresholds 16,384, 32,768   | None          |

The last row is a fourth three-bracket endpoint. These 17 are unconfirmed as billed behaviour:
`pricing_json` is opaque and neither public surface corroborates them.

## Schedule styles in `pricing_json`

| Endpoints | `peak_*` values        | Windows                                                   |
| --------: | ---------------------- | --------------------------------------------------------- |
|         4 | Dearer band            | One, JSON numbers, 0–1400                                 |
|         4 | Cheaper band           | One, strings, the cheap hours, with `originalPrice` shown |
|         2 | Dearer, cache hit/miss | Two, strings, Asia/Shanghai weekend flags                 |

⚠️ In the middle style `peak_*` names the cheaper rates, so source key names cannot identify the
dearer band. `overrides` and display tiers stay correct across all three styles. Display states the
DeepSeek weekend as `scheduleExceptions` from day 5 16:00 to day 0 16:00, which differs in form from
`utc_days` but covers no extra priced window.

## Other variants

The 1,484 text endpoints come first; the 266 others are named only where they differ.

- Service tiers and variants are separate endpoints with their own quotes: 155 tier endpoints and
  73 `batch` (77 in all); 71 tier endpoints and 24 `batch` endpoints carry conditional pricing.
- 16 `free` endpoints are zero-priced (28 in all). The 83 endpoints with zero `prompt` and
  `completion` without `is_free` are all outside the text population.
- Discount is nonzero on 129 endpoints (143 in all) and negative only on `xiaomi/mimo-v2.6-pro` (-0.2).
- Text `image` and `image_output` rates are all per token, on 90 and 15 endpoints. Per-image and
  per-megapixel rates appear only outside the text population. Three text `audio` rates are per minute.
- `image_token` (43 endpoints) has no entry in `priceMeters`; all 43 are outside the text population.
- `prompt` holds a per-hour transcription rate only outside it, on `microsoft/mai-transcribe-1.5` and `-2`.
- `video_input_tokens` (90), `cache_write_storage_hours` (85), and `x_search_calls` (17) exist only in
  `pricing_json`. Display shows `Video Input` on seven endpoints across all models.
- 149 of 490 `web_search` meters have no display row, so display is not a complete meter list.

## Corrections

- OpenRouter's models guide documents `overrides` rules this study treated as unknown. Absent keys inherit the base
  price, so the `internal_reasoning` conclusion above reflects `pricing_json`, which ORCA does not parse.

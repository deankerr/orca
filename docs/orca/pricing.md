# Pricing policy

## Observed quotes

ORCA retains observed decimal meter strings, discount, and conditional overrides as a complete quote.

- Presented rates already reflect discount; applying it again would double-discount them.
- Tiny movements and zero remain facts regardless of whether a product displays or announces them.

### Conditional pricing

Reported meters are the price. Schedule changes move them directly, so ORCA records each movement and never
computes a current band; a new schedule shape then cannot produce a wrong rate, at the cost of scan delay.

- `@orca/pricing` reads `overrides` into prompt-length brackets and schedule bands, for detail beside reported rates.
- Rows it cannot read stay as sent in `unrecognized`; interpretation never rejects or replaces observed data.
- Prompt-length conditions are distinct from schedules; checks use the condition keys, so unread rows still count.
- Views do not require a prompt size or time of day; conditional prices appear as extra detail.
- ORCA applies no discount to override rates, because observed rates show none to apply.
- ORCA does not parse `pricing_json`; a price stated only there is not treated as publicly offered.
- Captures preserve authored-pricing and other non-meter fields without interpreting them.
- Simultaneous changes do not establish causation.
- Conditional-price charts are outside Pricing History's scope.

## Presentation

`@orca/pricing` owns supported units and scaling. `numbers.ts` supplies shared decimal formatting and
exact relative comparisons. `alerts/present.ts` gives every alert product the same price labels, quantity text,
and favorable direction; product field names and markup remain presentation choices.

- Use `$` for USD; discount is a percentage adjustment, never a currency meter.
- Text, audio, cache, and image rates use MTOK; image rates are per token, not per image.
- ⚠️ Meter units are per field, so Voxtral's per-second `audio` rates present as MTOK until upstream states units.
- `web_search` is a per-search charge, unaffected by discount.
- Prices keep three significant digits, cents at minimum, and at most four decimals; smaller nonzero
  values keep one significant digit rather than rounding to zero.
- Eligibility compares original values before formatting.
- The old grid and Pricing History traces omit zero; change alerts can display transitions to or from zero.
- The new app treats zero as a real price of $0: free endpoints show `$0`, pass maximum-price filters, and sort first.
- `@orca/pricing` serves the new app only and owns rate interpretation: `quotedRate` keeps non-negative decimals.
- `perMillion` converts a quoted rate to a `Number` for sorting, filtering, and plotting; zero is 0.
- Absent, negative, malformed, and unrepresentable rates, such as `1e309`, have no `perMillion` value and sort last.
- `workloadCost` derives the cost figure from per-million rates, as Workload cost below describes.
- Display formats the original string, never the `Number`; zero reads `$0` rather than `$0.00`.

### Workload cost

Workload cost summarizes a text endpoint's price as one $/M figure under a workload, for comparing, sorting,
and plotting endpoints. A workload is two numbers: `ratio`, input tokens per output token, and `hitRate`, the
share of input tokens billed at the cache-read rate. The rest are fresh input: new tokens plus re-writes after
cache misses.

`cost = (ratio × inputCost + output) / (ratio + 1)`, where `inputCost` is the average price of an input token:

| Rates quoted                          | Fresh input rate `fresh` | `inputCost`                                   |
| ------------------------------------- | ------------------------ | --------------------------------------------- |
| No `input_cache_read`, or `hitRate` 0 | not applicable           | `input`                                       |
| Read, no `input_cache_write`          | `input`                  | `hitRate × cacheRead + (1 − hitRate) × fresh` |
| Read and write, `cacheWrite >= input` | `cacheWrite`             | same                                          |
| Read and write, `cacheWrite < input`  | `input + cacheWrite`     | same                                          |

- An absent read rate means the endpoint has no cache, never that its cache is unstated; a write rate is then ignored.
- A hit rate of 0 means the workload does not use a cache, so every input token costs the input rate on every endpoint.
- No write rate is charged at a hit rate of 0, since nothing is written to a cache the workload does not use.
- With no write meter there is no surcharge: first-pass tokens still pay the input rate.
- A write rate at or above input replaces the input rate, as on Anthropic and OpenAI at 1.25×.
- A write rate below input is a storage surcharge on top of input, as on Gemini; xAI quotes $0, which adds nothing.
- Only `input_cache_write`, the 5-minute rate, is used; `input_cache_write_1h` is not.
- Cost is absent when input or output is absent; free endpoints, with every rate zero, cost 0.
- Every share is applied to each rate before they are added, so huge finite rates stay finite whenever the cost is representable; a cost too large for a double is absent, like an unrepresentable rate.
- Log-scale plots cannot place 0, so a plot leaves free endpoints off.
- Cost ignores audio, image, and conditional rates.
- Rows keep rates only; the cost is computed from a row and a workload wherever it is needed.

The state is the two numbers; a preset is a named pair, and the active preset is the one both numbers equal.
`agentic` is the default, because most agent spend is cached input.
Each preset rests on a published source, read on 2026-11-22; the figures are rounded to numbers the URL can carry.

| Preset    | Label    | Ratio | Hit rate | Basis                                                              |
| --------- | -------- | ----: | -------: | ------------------------------------------------------------------ |
| `agentic` | Agentic  |   100 |      90% | OpenRouter Inferred 03, agentic keys: 99:1 at 88%                  |
| `chat`    | Chat     |     7 |       0% | OpenRouter Inferred 03, human keys: 7:1; hit rate chosen           |
| `aa`      | AA blend |     9 |      78% | Artificial Analysis methodology: 7:2:1 of cache hit, input, output |

- `agentic`: OpenRouter's agentic API keys were roughly 87% cached prompt, 12% novel prompt, 1% output in 2026-09.
- That is 99 input tokens per output token, 88% read from cache (87 / 99; our arithmetic); the preset rounds both.
- The source is the _Inferred_ newsletter, edition 03 "Cache is Crucial", 2026-10-08.
- `chat`: for human keys, output plus reasoning is about 12% of tokens, so about 7:1 (88 / 12; our arithmetic).
- OpenRouter does not publish the human keys' cached share; novel prompt is still the majority, so under 50%.
- Chat's hit rate of 0 is our choice, not a measurement: every input token pays the uncached rate.
- Microsoft's Azure public LLM inference traces for a conversation service corroborate the ratio.
- They give 5.5:1 (2023, 19,366 requests) and 15.5:1 (May 2024 week, 27.3M requests), computed by us from the CSVs.
- Those are total input over total output tokens, and the traces predate prompt caching.
- `aa`: Artificial Analysis blends "a 7:2:1 ratio of cache hit, input, and output tokens" (methodology page).
- That is 9 input tokens per output token with 7/9 = 77.8% read from cache, rounded to 78% for the URL's whole percent.
- It is a published convention, not a measurement, and the page gives no reason for the ratio.
- It does not say how cache writes or endpoints without a cache-read rate are treated, so `aa` only approximates it.
- ORCA's figure can differ from Artificial Analysis's where an endpoint quotes a write rate or has no cache.
- 3:1 was an older Artificial Analysis convention, since replaced by 7:2:1; no measured workload is that output-heavy.
- The lowest measured ratio is 5.5:1, so 3:1 is no preset but stays reachable as a custom workload (`?ratio=3&hit=0`).
- A custom 3:1 at 0%, shown as `3:1 · 0%`, equals ORCA's former blended price, `0.75 × input + 0.25 × output`.
- It does on every endpoint, whatever its cache rates.

### Workload cost in the app

- The workload is URL state (`ratio`, `hit`), so it governs the Table and the plot together and survives sharing.
- A control in the Results scope bar sets it: the presets, a ratio field, and a hit-rate field, applied as typed.
- Only values that parse as valid are applied; leaving a field restores the last valid value.
- The Table's Cost column shows the workload cost, sorts ascending first, and its header states the workload.
- Cost is the first figure column, after Model and Provider and before Input, at every width.
- Cost is formatted like the Input, Output, and Cache R cells: always three decimals (`$0.380`, `$12.500`) so the decimal points line up; a free endpoint shows `$0`, an absent cost a dash, and a nonzero cost that three decimals would erase falls back to the fuller price format (`$0.0004`).
- The plot's cost axis spans the whole catalogue's plottable costs under the workload, rounded outward to 1-2-5 steps.
- Filtering moves dots and never the axis; changing the workload re-fits it, so no endpoint is ever off scale.
- The control's button shows the ratio and hit rate (`100:1 · 90%`), never a preset's name; only the presets inside its popover are named.
- The plot's caption does not name the workload; it reads `Cost $/M × tok/s p50 · log scales` whatever the workload.

### No-cache marks

- A hollow ring marks an endpoint whose lack of a cache raises its workload cost, in the Table's Cost cell and on the plot.
- The mark appears when the endpoint has no `input_cache_read`, the workload's hit rate is above 0, and its cost is above 0.
- At a hit rate of 0 no endpoint uses a cache, so no endpoint is marked; the plot draws filled dots, shows no legend entry, and its description and hover detail omit the mark.
- A free endpoint is never marked: a cache cannot change a cost of 0.
- The plot draws the mark as a hollow ring where other endpoints are filled dots; the Table shows a ring beside the cost.
- `isCostRaisedByNoCache` in `@orca/pricing` is the rule; the Table and the plot both read it.
- It carries no colour, because the role of colour in the app is not settled.

Alert schedule detection and eligibility belong to `events.md`; quote retention does not depend on them.

### Presentation exclusions

`internal_reasoning` is misleading, and `request` and `variable_pricings` are obsolete presentation
signals. Catalog products omit them.

The frozen public API keeps independently defined compatibility fields and formatting, including
differences from these product policies.

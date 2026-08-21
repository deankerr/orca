# Pricing

How ORCA names, displays, and treats endpoint prices. Upstream OpenRouter representations
(`pricing`, `pricing_json`, `display_pricing`, …) are documented in `docs/openrouter/pricing.md`.
This note is the product policy those observations get projected into.

There is no one display form. Grid, Monitor, Discord, and the flag-gated model page have different
space and density. They should share _meaning_ — which keys are prices, what they measure, what is
dead — not a single formatting function. Multiple formatters exist because we tried to enforce one.

## Surfaces

Public:

- Endpoints data grid
- Monitor
- Discord embeds (the squeeze: mobile-width embed fields)

Behind the experimental-features flag, so not a public pricing surface:

- Model page, including provider comparison and pricing history

Discord is where long keys fail first. Policy has to survive that width, not just a desktop table.

## Why we rename

OpenRouter's pricing keys are inconsistent and often ambiguous (`prompt` / `completion`,
`input_cache_read` with no modality, `image` vs `image_output`, `internal_reasoning`, `request`).
Ingest already maps those into catalog storage (`text_input`, `cache_read`, …). Projection then
retouches a subset so the keys themselves can be shown.

The intent was to render property keys to users, tying the UI to ORCA's schema. That only works
when keys are short enough to sit next to each other. `text_input` / `text_output` are fine.
Adding a `text_` prefix on cache keys (`text_cache_read`) made them stick out next to those —
especially in Discord — so surfaces started stripping it ad-hoc. Text is implied: the product
keys are `cache_read` / `cache_write`.

OpenRouter later moved their own display labels from "Prompt" → "Input" and "Completion" →
"Output", _after_ we had already done that. Commonly understood terms keep moving. Align on what
users say now, not on a frozen upstream label, and not on the longest schema-faithful key.

Shorthand is allowed and useful: `IN: $x.xx` / `OUT: $x.xx`, optionally with a modality icon
(text, image, …). Do not assume IN/OUT _pairs_ are the usual shape of an endpoint. They aren't.

## Currency and units

OpenRouter only quotes USD. Inference prices are compared in USD everywhere. Product UI never
spells out `USD` — `$` is the currency. Do not store or render per-key strings like
"USD per million tokens".

| Kind                                               | Scale       | Unit when shown | When omitted                                                     |
| -------------------------------------------------- | ----------- | --------------- | ---------------------------------------------------------------- |
| Text-like token rates (`text_*`, `audio_*`, cache) | × 1,000,000 | `MTOK`          | Default. Most users read these as per million tokens.            |
| Image token rates (`image_input`, `image_output`)  | × 1,000     | `KTOK`          | Tight layouts (Discord).                                         |
| `web_search`                                       | × 1         | per web search  | Treat as a capability annotation, not a column of market prices. |
| `discount`                                         | × 100       | `%`             | Render as e.g. `20% off`. Not a currency.                        |

`MTOK` / `KTOK` come off first under space pressure. `$` stays.

## Prevalence

Design for the common keys, and for absence.

- `text_input` / `text_output` — usual pair when text is priced.
- `cache_read` — common.
- `cache_write` — mainly Claude and Gemini. Most endpoints do not charge it.
- `image_input` — very common.
- `image_output` — extremely uncommon.
- `audio_input` / `audio_cache_read` — rare; MTOK like the other token rates.
- `web_search` — uncommon; see below.
- `discount` — already baked into the other rates when present.

A layout that reserves paired IN/OUT slots for every modality will be mostly empty.

## Field policy

Catalog storage names stay as stored. Projection / UI names are the product vocabulary. Historical
rows keep obsolete keys in the schema; UI simply stops treating them as prices.

### Shown as prices

| Storage             | Product key        | Unit | Notes                                                                                                |
| ------------------- | ------------------ | ---- | ---------------------------------------------------------------------------------------------------- |
| `text_input`        | `text_input`       | MTOK |                                                                                                      |
| `text_output`       | `text_output`      | MTOK |                                                                                                      |
| `cache_read`        | `cache_read`       | MTOK | Text is implied. Common.                                                                             |
| `cache_write`       | `cache_write`      | MTOK | Text is implied. Rare; Claude and Gemini.                                                            |
| `image_input`       | `image_input`      | KTOK | Per thousand _tokens_, not per image. Common.                                                        |
| `image_output`      | `image_output`     | KTOK | Same unit. Extremely uncommon.                                                                       |
| `audio_input`       | `audio_input`      | MTOK | Rare.                                                                                                |
| `audio_cache_input` | `audio_cache_read` | MTOK | Rare. Storage keeps `audio_cache_input`; the product name corrects a long-running write/read mix-up. |

Surfaces may print the product key or IN/OUT shorthand. They should not invent a third name for
the same rate.

### `discount`

The one non-currency pricing field. Already applied to the other rates — do not compute a
discounted price from it. `discount` never applies to `web_search`. Render as a percentage off
(`20% off`), not as `$`.

### `web_search`

Not a market rate like the others, and may be set by OpenRouter rather than the provider.

- Discount does not apply.
- Almost never changes.
- Uncommon. Gemini and GPT native search; some Anthropic-hosted Claude (not Vertex or Bedrock);
  Grok at `$0.005` vs the more common `$0.01`.
- Unit: per web search.
- Prefer attaching it to the `native_web_search` capability, not listing it with token prices.

### Present in data, not in UI

**`request`** (sometimes projected as `per_request`). Obsolete. Absent from live data for some
time. Historical records exist, so the catalog schema keeps the field. Drop it from UI and from
any display-oriented projection.

**`internal_reasoning`** (sometimes projected as `reasoning_output`). Still present, exclusively
on Gemini, always the exact same value as `text_output`, and not an extra charge or dimension. It
reads as an OpenRouter internal leaking through. Drop it from UI. Do not show it as a reasoning
premium.

### `variable_pricings`

Upstream deprecated this in favor of a per-provider model that is much more complex. We have not
started on that problem. Our `variable_pricings` field will not be reused — it is schema/db
legacy. Drop it from UI if anything still surfaces it.

## What this is not

- A requirement that every surface call the same `formatPricing`.
- A requirement that every catalog key appear in the grid, history, or Discord.
- A schema or data migration. Storage keeps what we ingested; product policy decides what is a
  price today.

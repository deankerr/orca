# Pricing policy

ORCA preserves observed prices and applies product-specific presentation.

## Observed rates

ORCA retains the decimal meter strings OpenRouter presents, with discount and conditional
overrides alongside them. Tiny movements are real observations; display rounding must not
change the captured facts or turn small nonzero prices into zero.

- Never apply `discount` a second time to a presented rate.
- Retain zero in stored history; products omit it from displayed rates.
- Preserve conditional overrides with their observation. Today's Catalog cannot explain a historical quote.

Schedule changes can move presented rates without changing authored pricing. ORCA stores those
movements without choosing a canonical base band or parsing `pricing_json`. Prompt-length
overrides describe a different condition and must not be treated as schedules. Capturing a quote
does not require every product to announce it as a price change.

Compare rate, discount, override, revision, tier, and authored-pricing observations
independently; simultaneous changes do not establish causation. Preserve opaque
`pricing_json` and `tiers` values without interpreting their internal rules.

## Presentation

Products share price meaning, units, and supported meters; they need not share one formatter.
The Grid, Monitor, Entity Overview, Pricing History, and Discord have different density constraints.

- Use `$` for USD. Avoid repeating currency names on each rate.
- Text, audio, and cache token rates scale by 1,000,000 (`MTOK`). Image token rates scale by 1,000 (`KTOK`).
- Image rates are per token, not per image. A shared unit caption across all meters is misleading.
- Unit captions may be omitted where the scale is understood, especially in compact Discord cards.
- Use Input/Output or IN/OUT when helpful. Do not reserve paired slots for every modality; most would be empty.
- Product names such as `text_input` and `cache_read` are presentation vocabulary, not stored meter names.
- `discount` is a percentage adjustment, never a currency meter. Zero means no adjustment.

`web_search` is a per-search service charge, unaffected by discount. Prefer showing it with the
native-search capability.

`priceMeters.ts` is authoritative for supported meter units and scaling; each product selects
its labels and meters. Do not duplicate the complete mapping here.

## Deliberately omitted meters

Do not display or surface these fields:

- misleading: `internal_reasoning`
- obsolete: `request`, `variable_pricings`

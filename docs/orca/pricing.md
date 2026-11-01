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
- Grid rates and Pricing History traces omit zero; change alerts can display transitions to or from zero.

Alert schedule detection and eligibility belong to `events.md`; quote retention does not depend on them.

### Presentation exclusions

`internal_reasoning` is misleading, and `request` and `variable_pricings` are obsolete presentation
signals. Catalog products omit them.

The frozen public API keeps independently defined compatibility fields and formatting, including
differences from these product policies.

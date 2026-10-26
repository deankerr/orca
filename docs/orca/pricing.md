# Pricing policy

## Observed quotes

ORCA retains observed decimal meter strings, discount, and conditional overrides as a complete quote.

- Presented rates already reflect discount; applying it again would double-discount them.
- Tiny movements and zero remain facts regardless of whether a product displays or announces them.

### Conditional pricing

Schedule changes can move presented rates without changing authored pricing. ORCA records the movement
without choosing a base band or interpreting `pricing_json`.

- Prompt-length conditions are distinct from schedules.
- Captures preserve opaque authored-pricing and other non-meter fields; quotes do not interpret their rules.
- Simultaneous changes do not establish causation.
- Conditional-price charts are outside Pricing History's scope.

## Presentation

`priceMeters.ts` owns supported units and scaling. `numbers.ts` supplies shared decimal formatting and
exact relative comparisons. `alerts/present.ts` gives every alert product the same price labels, quantity text,
and favorable direction; product field names and markup remain presentation choices.

- Use `$` for USD; discount is a percentage adjustment, never a currency meter.
- Text, audio, and cache rates use MTOK; image rates use KTOK and are per token, not per image.
- `web_search` is a per-search charge, unaffected by discount.
- Rounding must preserve small nonzero values; eligibility compares original values before formatting.
- Grid rates and Pricing History traces omit zero; change alerts can display transitions to or from zero.

Alert schedule detection and eligibility belong to `events.md`; quote retention does not depend on them.

### Presentation exclusions

`internal_reasoning` is misleading, and `request` and `variable_pricings` are obsolete presentation
signals. Catalog products omit them.

The frozen public API keeps independently defined compatibility fields and formatting, including
differences from these product policies.

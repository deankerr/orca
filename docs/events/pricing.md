# Pricing interpretation

- Tiny decimal movements are real changes; captured and curated facts preserve their exact values.
- Numeric presentation rounds independently of those facts; small nonzero prices never become zero.
- Text input/output and cache prices scale from per-token rates by 1,000,000, without a unit suffix.
- Unfamiliar decimal representations retain their original per-token form in text.
- `discount` is an independent numeric fact already reflected in normalized rates.

## Coarse renderer filter

- Text/JSON and Discord suppress endpoint pricing updates unless at least one eligible meter moves by 2% or more, measured before rounding.
- Valid transitions between unmetered (zero/absent) and a positive rate also qualify.
- Invalid, negative, or non-string meter values are ineligible; they never bypass the threshold. No eligible meter means the pricing event is suppressed.
- Discount does not independently qualify an event; it is already reflected in presented rates.
- Lifecycle events and updates without pricing changes remain outside this rule.
- Accepted limitation: suppression drops the whole event, including any coincident non-pricing changes. Captured events and curated facts remain intact.

## Independent signals

- Normalized rates, `display_pricing`, `pricing_json`, and `pricing_version_id` can move independently.
- The feed currently selects normalized meters and discount; opaque pricing, revisions, and overrides are omitted.
- Raw Events retains those additional signals for future interpretation.
- ❓ Should presentation-only, opaque-pricing, and revision-only changes be exposed as explicit feed signals?

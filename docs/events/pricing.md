# Pricing interpretation

- Tiny decimal movements are real changes; comparison and feed values preserve their exact representation.
- The initial feed applies exact-value selection, including changes between zero and absence.
- Text input, output, and cache rates are per token; rendered details scale fixed-point values to per million tokens.
- Unfamiliar decimal representations retain their original per-token form in text.
- `discount` is an independent numeric fact already reflected in normalized rates.

## Independent signals

- Normalized rates, `display_pricing`, `pricing_json`, and `pricing_version_id` can move independently.
- The feed currently selects normalized meters and discount; opaque pricing, revisions, and overrides are omitted.
- Raw Events retains those additional signals for future interpretation.
- ❓ Should presentation-only, opaque-pricing, and revision-only changes be exposed as explicit feed signals?

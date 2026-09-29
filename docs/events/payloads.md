# Payloads

- The payload retains one native `json-diff-ts` root node. Hoisted identity and type make selection convenient while preserving the library's representation.
- An entity UPDATE can contain child ADDs and REMOVEs. Keeping the root preserves that lifecycle distinction.
- JSON storage accommodates arbitrary upstream keys. [Context](context.md) remains native for common identity-based selection.
- Lifecycle changes carry the complete projected entity. UPDATEs carry changed facts; richer field context is [deferred](open.md#deferred-capabilities).
- Metadata retains source changes so renderers can choose what matters to their audience. Pricing interpretation deserves dedicated handling because its volume and representations dominate much of the feed.
- Tiny decimal price movements are real changes. Preserve exact values and interpret their scale using the meter's units; text-token rates are per token. See [pricing](../openrouter/pricing.md).

## Comparison choices

- Homogeneous string arrays use `$value` identity, including newly encountered fields. Additions and removals appear as direct membership edits.
- `treatTypeChangeAsReplace: false` preserves legacy behavior: common string/number ↔ `null` transitions remain direct UPDATEs with both values. Null is an observed value.

## Accepted limitations

- `$value` collapses repeated strings; changes solely to duplicate counts are intentionally unobserved.
- Object-to-scalar transitions can omit the new scalar or the entire change. This rare case is an accepted library limitation.
- Native `$value` matching drops the literal string `__proto__`; this is accepted as outside the entity data we consider.
- Arrays nested directly inside arrays retain positional behavior and are outside the supported entity shapes.
- In `json-diff-ts` 4.10.4, `applyChangeset` skips UPDATEs to `null`, although `diff` preserves them. Event interpretation reads the change nodes directly.

The [diff-shape experiment](../../packages/scripts/event-shape.ts) records the native behavior and the null-application limitation.

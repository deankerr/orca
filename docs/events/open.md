# Open

## Next product slice

- A readable JSON feed with structured changes and short natural-language descriptions will exercise the shared interpretation tools.
- Grid direction: an entity-focused successor to Monitor, with a pool of already-known events available while focused queries load.
- Discord direction: internal rendering with publication-sensitive batching and delivery state.

## Deferred capabilities

| Capability             | Possible starting point                                                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chronological history  | Index observation time and paginate. The current 100-row inspection feed uses write order, so a late retry can surface old observations at its head.  |
| Focused selection      | Index kind/ID plus time for entity history, or model/provider IDs already in context for grouped views. Choose combinations from actual reader needs. |
| Change-based selection | Derive fields such as `has_pricing_change` or selected changed paths when query needs justify them.                                                   |
| Richer field context   | Capture selected before/after values, such as complete pricing around a changed meter.                                                                |
| Large pair output      | Stage bounded batches and publish on completion if one pair exceeds the current single-mutation envelope.                                             |

- Regeneration, backfill, and provenance are [globally deferred projection concerns](projections.md#globally-deferred).
- Transaction rollback and concurrent retry checks can use the shared Convex test harness when it exists.

## Telemetry

- Potential noise handling is scoped to [endpoint telemetry](../openrouter/telemetry.md): `stats`, `statsByTier`, `status`, and `capacity_tpm`.
- Events currently excludes `stats`, `statsByTier`, and `status`; `capacity_tpm` still appears in metadata changes.
- How Events should handle telemetry, including `capacity_tpm`, remains open.

## Open questions

- Which first reader drives selection: exact entity history, a model with its endpoints, or pricing activity?
- How should selectors and renderers present the independent signals from normalized prices, `display_pricing`, opaque `pricing_json` values, and pricing-version-only changes?
- How should renderers present tiny, real price changes at useful token-volume scales while preserving exact values? Text-token rates are expressed per token.
- Which explanations need complete old/new pricing, or both old and new related display names when an endpoint changes relationships?

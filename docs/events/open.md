# Open

## Next product slice

- A readable JSON feed with structured changes and short natural-language descriptions will exercise the shared interpretation tools.
- Grid direction: an entity-focused successor to Monitor, with a pool of already-known events available while focused queries load.
- Discord direction: internal rendering with publication-sensitive batching and delivery state.

## Deferred capabilities

| Capability                      | Possible starting point                                                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Additional selection dimensions | Build on the existing entity/model/provider queries; filter a bounded working set or add indexes when reader needs justify them. |
| Richer field context            | Capture selected before/after values, such as complete pricing around a changed meter.                                           |

- Regeneration, backfill, and provenance are [globally deferred projection concerns](projections.md#globally-deferred).
- Transaction rollback and concurrent retry checks can use the shared Convex test harness when it exists.

## Telemetry

- Potential noise handling is scoped to [endpoint telemetry](../openrouter/telemetry.md): `stats`, `statsByTier`, `status`, and `capacity_tpm`.
- Events currently excludes `stats`, `statsByTier`, and `status`; `capacity_tpm` still appears in metadata changes.
- How Events should handle telemetry, including `capacity_tpm`, remains open.

## Open questions

- How should the overlay [compose selection scopes](selection.md#overlay-scope-questions) and relate them to the current Grid selection?
- How should selectors and renderers present the independent signals from normalized prices, `display_pricing`, opaque `pricing_json` values, and pricing-version-only changes?
- How should renderers present tiny, real price changes at useful token-volume scales while preserving exact values? Text-token rates are expressed per token.
- Which explanations need complete old/new pricing, or both old and new related display names when an endpoint changes relationships?

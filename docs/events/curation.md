# Curation

- The shared alert selection follows Grid endpoint facts and model/provider overview fields.
- Paths preserve upstream names; aliases and display fallbacks belong to product presentation.
- Absence, null, false, and zero remain distinct values; a value becoming null is still an update.
- Valid changes outside the selection disappear; malformed selected changes fail visibly.
- Field discovery, units, schemas, and consumer tooling belong with the future ORCA API and OpenAPI ecosystem.

## Telemetry

- Raw Events excludes `stats`, `statsByTier`, and `status`; `capacity_tpm` still produces metadata changes.
- Shared alert preparation excludes endpoint telemetry to keep model/provider activity useful.
- ❓ Should `capacity_tpm` remain in raw Events, or follow the other excluded telemetry fields?

## Capabilities

- `features.supports_implicit_caching` and `features.supports_native_web_search` are true-or-absent signals.
- Related capabilities such as `has_chat_completions` use top-level booleans.
- The September 29 Decart / Kimi K3 arrival retains `features: {}` after all observed children are excluded.
- ❓ Should capabilities share a normalized representation that also removes empty curated containers?

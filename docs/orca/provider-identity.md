# Provider extraction policy

ORCA presents one provider across its upstream routing variants. Identity is an
opinionated normalization of `provider_info.slug`: explicit historical repairs take
precedence, then the prefix before the first slash becomes `provider_id`. The repairs
live in `scan/provider.ts`. Upstream `name` remains descriptive metadata.

Historical repairs deliberately retain ModelRun continuity across its host and
branding changes, retain W&B separately from CoreWeave, and group Claude Platform
on AWS with its earlier `Anthropic 2` phase. Changes in observed names and policy
URLs remain metadata updates within those identities.

Extraction applies the same identity to providers and their endpoint relationships.
Endpoint UUIDs, routing tags, and display labels retain their observed meanings.
The raw collection remains available independently of extraction, including to the
frozen public API adapter.

## Selecting provider facts

- Prefer embedded records whose raw slug already equals the normalized identity.
- Within that pool, choose the most frequent complete cleaned record. If no canonical
  record was observed, use all records for that identity. Equal counts break by
  canonical JSON order, so traversal order cannot select different facts.
- Keep the selected record whole. Mixing fields from conflicting observations could
  manufacture a provider state that OpenRouter never supplied.
- A change in the selected record is an observed metadata update. Historical URLs
  and display names can change while the provider identity continues.

## Metadata boundary

Provider extraction omits known internal configuration and endpoint defaults:
adapters, hosts, pricing/region configuration, capability flags, behavioral policy
defaults (including legacy `paidModels`), owners/editors, model denylists, and upstream
icon presentation. These are inconsistent across endpoints or belong to upstream
implementation details. Endpoint capability and data-policy fields remain intact.

Names, location, status and policy URLs, `byokEnabled`, `sendClientIp`, and unknown
future fields survive extraction. The organization-level `byokEnabled` flag is distinct
from endpoint `is_byok`. Missing values, explicit nulls, and empty policy objects remain
distinct. Adding an omission is a deliberate policy change; new fields remain visible
until evidence supports discarding them.

Historical evidence for the repairs is recorded in `docs/openrouter/providers.md`.

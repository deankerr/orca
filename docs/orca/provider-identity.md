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

Provider extraction chooses one representative observation per identity. Its purpose
is a useful base display name and a coherent provider record, not reconciliation of
every inconsistent upstream copy. Google Vertex and Google AI Studio remain distinct
providers; an internal `name` such as "Google" cannot substitute for their display
names.

Selection uses only raw slug, display name, and source endpoint UUID:

Prefer observations whose raw slug equals the normalized identity; fall back to all observations for
that identity when none match.

Choose the most frequent `displayName` in that pool, breaking equal counts by lexical display-name
order. Each embedded endpoint observation contributes a vote.

Among observations with the winning name, take the one with the lexically smallest endpoint UUID.
Retain its complete cleaned provider record.

The UUID is an arbitrary stable tie-break, not an authority or freshness signal.
This keeps source traversal order out of selection. All retained metadata besides
`displayName` is opaque to selection: different URLs, locations, or unknown future
fields cannot split votes or change the chosen source. Structural comparison belongs
to consumers comparing the resulting provider across scans.

A metadata change in the selected source survives extraction. A conflicting change
in an unselected source may disappear. That loss is an accepted consequence of a
single representative; fields are never assembled into a state absent from the scan.
A change in candidate membership or labels can change the representative and its
metadata. The raw capture retains every observation independently.

These rules are confined to `scan/provider.ts`. The public provider-list endpoint
is not an extraction dependency, so historical replay uses the same evidence as
current extraction.

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

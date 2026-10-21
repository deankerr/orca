# Provider observations

## Embedded names

`provider_info` mixes provider facts, routing variants, and endpoint configuration. Its fields
are evidence about upstream concepts rather than an authoritative entity model.

`provider_info.name` behaves like an internal provider key across routing variants. This is an
inference from captured relationships, not confirmation of OpenRouter's database schema.
`displayName` supplies user-facing naming but can include Fast, Turbo, or BYOK Only variants.

## Public provider list

The public list at `https://openrouter.ai/api/v1/providers` overlaps embedded provider metadata.
It was unavailable during part of the retained history and is absent from ORCA scans. Maintainer
observations suggest incomplete coverage of known providers; completeness remains unestablished.

The response checked on 2026-10-10 exposed `name` and `slug`, locations, and policy/status URLs,
but no display-name field. It called `google-vertex` "Google" and `google-ai-studio` "Google AI Studio".
Their endpoint offerings, BYOK credentials, and logos differ; Vertex also hosts Claude.

# Provider identity and endpoint-local fields

This is ORCA's settled working rule for ambiguous OpenRouter provider data. It deliberately keeps
a low-priority issue simple. Differences between provider labels and endpoint labels are expected;
they are not inconsistencies to fix by substituting values, merging entities or inventing a hierarchy.
Reopen this policy only in an explicitly developer-led investigation, not during routine review or
implementation.

## Ownership rule

Models and providers are normalized entities. They do not have separate per-endpoint states.
An endpoint refers to those entities and owns its own configuration and presentation facts.

| Observed source                  | ORCA meaning                                                                |
| -------------------------------- | --------------------------------------------------------------------------- |
| `provider_info`                  | Source observation for the related normalized provider entity.              |
| `provider_info.slug`             | Provider entity identity.                                                   |
| `provider_info.displayName`      | Display name of the provider entity.                                        |
| Endpoint `provider_display_name` | Endpoint-local provider label; use this when displaying the endpoint.       |
| Endpoint `provider_name`         | Endpoint property, even when it equals `provider_info.name`.                |
| Endpoint `provider_model_id`     | Provider-side model identifier for this endpoint.                           |
| Endpoint `provider_region`       | Region information supplied for this endpoint.                              |
| Endpoint `provider_slug`         | Endpoint accessor, renamed `provider_tag` in ORCA; not a provider identity. |

- Source endpoint fields prefixed with `provider_`, except the related body `provider_info`, belong
  to the endpoint. A naming prefix does not transfer ownership to the provider entity.
- Copy an endpoint's `provider_display_name` from that endpoint's source field. Do not derive it
  from either the endpoint's embedded `provider_info.displayName` or the selected provider record.
- Preserve the endpoint's tag as opaque data; do not infer identity or configuration from its suffix.
- Assembly is the sole translation boundary for the overloaded upstream names: replace
  `provider_info.slug` with `provider_id` and endpoint `provider_slug` with `provider_tag`.
  Remove both source properties from the assembled bodies; downstream consumers use only the
  unambiguous names, not a "provider slug" concept.
- A different label does not establish a different provider entity, and a similar label does not
  establish that two provider identities should be merged.
- Model/provider metadata stays with its owning normalized entity. Do not duplicate it into endpoint
  metadata or describe duplicated values as endpoint-specific versions of those entities.

Selected typed context fields in a product row are projections of related entities, not independent
entity states. Historical entity context is resolved at the selected observation time. An endpoint's
own label remains endpoint data at that time.

## Why the rule is intentionally simple

OpenRouter's bookkeeping, ORCA's entity identities and users' ideas of a provider need not agree.
We observe the exposed fields; we do not know the complete upstream model or its reasons for changing.

- `Azure (BYOK Only)` may describe a configuration of Azure. That is not evidence for a separate
  ORCA provider identity, nor a reason to replace the endpoint's label with `Azure`.
- `DeepInfra Turbo` may reflect a more distinct upstream offering. A difference such as
  `DeepInfra Turbo` versus `DeepInfra (Turbo)` does not establish its entity boundaries. Users can
  reasonably understand either as DeepInfra without needing ORCA to settle that question.
- `Google Vertex (US)` and `Google Vertex (Global)` are useful distinctions when comparing endpoints.
  Replacing both with `Google Vertex` hides information users need, even if both endpoints refer to
  the same provider entity.

These are interpretations, not an authoritative upstream taxonomy. New observations may require us
to reinterpret the data as a whole. A configuration/organization/variant hierarchy would encode more
certainty than the evidence supports and is not needed for the current products.

## Implementation references

[`bundle-analysis/schemas/endpoint.ts`](../../packages/scripts/bundle-analysis/schemas/endpoint.ts)
models the endpoint-local fields separately from `provider_info`. Its omission of an explicit
`provider_slug` declaration does not change that field's endpoint ownership.

V3's projection reads an endpoint label from `provider_info.displayName`; this is a known source-field
mistake, not precedent to preserve. V4 copies the endpoint-local label and stores only endpoint-owned
metadata on Catalog endpoints; the corrections are recorded in [the core refinement stage](../v4/stages.md).

[OpenRouter provider observations](../openrouter/providers.md) supplies empirical background.
Observed agreements between fields are not identity guarantees and do not override this policy.

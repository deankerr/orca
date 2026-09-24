# ORCA

ORCA observes OpenRouter models, endpoints and providers over time.

## Language

**MEPs**:
Models, endpoints and providers: the three entity kinds observed by ORCA.

**Entity observation**:
The facts known about one entity at a scan time, including its identity and relationships.
An observation dates ORCA's knowledge rather than the upstream change itself.

**Model**:
A model offering identified in ORCA by its model slug, including any variant suffix.
Once observed, a model remains known even when it has no listed endpoints.

**Provider**:
A model-serving provider identified in ORCA by its provider slug.
Once observed, a provider remains known even when it has no listed endpoints.

**Endpoint**:
A provider configuration offering a model, identified by an upstream UUID.
An endpoint can become unlisted and later listed again under the same identity.

**Slug identity**:
A name-based model or provider identity, distinct from an endpoint's UUID identity.
A different slug does not by itself establish continuity with a previously known entity.

**Provider tag**:
An endpoint-specific upstream accessor key whose value can change or be shared by endpoints.
It is endpoint data, not an ORCA provider or endpoint identity.
_Avoid_: Provider ID, endpoint ID

**Listing**:
An endpoint's observed availability and its associated model and provider at an observation time.
Models and providers have listed endpoints rather than listing states of their own.

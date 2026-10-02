# ORCA

ORCA observes OpenRouter models, endpoints and providers over time.

## Language

**MEPs**:
Models, endpoints and providers: the three entity kinds observed by ORCA.

**Entity observation**:
The facts known about one entity at a scan time, including its identity and relationships.
An observation dates ORCA's knowledge rather than the upstream change itself.

**Baseline**:
The observation at which a deployment's retained knowledge begins. Facts present in it were already
true when observed; it does not establish when they first became true upstream.

**Initialization**:
Establishing initial knowledge from the baseline, before processing changes between observations.
It is separate from routine pair processing and does not represent upstream creation events.

**Model**:
A model offering identified in ORCA by its model slug, including any variant suffix.
Once observed, a model remains known even when it has no listed endpoints.

**Provider**:
A model-serving provider identified in ORCA by its provider slug.
Once observed, a provider remains known even when it has no listed endpoints.

**Endpoint**:
A provider configuration offering a model, identified by an upstream UUID.
An endpoint can become unlisted and later listed again under the same identity.

**Endpoint stats**:
The upstream-provided `stats` or tier-specific `statsByTier` values observed for an endpoint.
Their contents are upstream-defined; consumers interpret the particular fields they use.
_Avoid_: Readings, performance samples

**Slug identity**:
A name-based model or provider identity, distinct from an endpoint's UUID identity.
A different slug does not by itself establish continuity with a previously known entity.

**Provider tag**:
An endpoint-specific upstream accessor key whose value can change or be shared by endpoints.
It is endpoint data, not an ORCA provider or endpoint identity.
_Avoid_: Provider ID, endpoint ID

**Listing**:
An endpoint's observed availability, associated model and provider, and provider tag at an observation time.
Models and providers have listed endpoints rather than listing states of their own.

**Arrival / departure**:
An endpoint becoming listed or unlisted, or a model/provider gaining its first or losing its last listed endpoint.
These transitions can repeat without changing the entity's identity.

**Previously known**:
An arriving identity was already known before this observation, including knowledge established at the baseline.
A historical model record establishes knowledge even when ORCA has never observed endpoints for it.

**Ingestion**:
An observation pair whose prerequisites have completed, making it available for downstream processing.

**Pair processor**:
Derives output for one ingestion's observation pair, with any historical context bounded to that observation.
Catalog, Listings and current stats are not pair processors.

**Processor work**:
One pair processor's obligation for one ingestion. It remains outstanding until its output commits,
even if later ingestions have completed for that processor.

**Entity event**:
A normally immutable, self-contained projection of one entity's changes within an ingestion, addressed
by the observation pair and the entity's identity within its kind. Its content can be regenerated as
the projection evolves.

**Identity context**:
The identifying facts accompanying an entity event, including display names and the model, provider,
and endpoint identities relevant to it.

**Field change**:
An addition, removal or update to one entity field, including changes to a string set's membership.

**Alert**:
Content prepared from entity events for a consumer, before presentation as a message, card or feed entry.
Consumers can apply different field selection, filtering and batching policies to the same events.

**Batch alert**:
One identical field change shared by multiple entities at the same observation, together with their
identities and source events. Other field changes remain in individual alerts.

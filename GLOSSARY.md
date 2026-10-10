# ORCA

ORCA observes OpenRouter models, endpoints, and providers over time, retaining
current knowledge and historical changes for technical OpenRouter users.

## Language

### Entities and their facts

**MEPs**:
Models, endpoints, and providers: the three entity kinds observed by ORCA.

**Entity**:
A model, provider, or endpoint whose identity and observed facts ORCA follows over time.

**Model**:
A model offering identified in ORCA by its model slug, including any variant suffix.
It remains known even when it has no listed endpoints.

**Provider**:
A model-serving service identified by an ORCA-normalized provider slug, spanning its upstream routing variants and known aliases.
It remains known even when it has no listed endpoints.

**Endpoint**:
A provider's serving resource for a model, identified by an upstream UUID.
It can become unlisted and later listed again under the same identity.

**Provider tag**:
An upstream accessor key for routing to an endpoint, which can change or be shared by endpoints.
_Avoid_: Provider ID, endpoint ID (when referring to this routing key)

**Metadata**:
The open-ended entity facts retained alongside ORCA's explicitly defined entity properties.

**Endpoint stats**:
The metrics data derived exclusively from the `stats` and/or `statsByTier` fields on upstream endpoint records.
Both fields are in scope; other upstream fields are not Endpoint stats.

**Price quote**:
An endpoint's observed meter rates, discount, and conditional pricing overrides at a scan time.

### Observations and retained knowledge

**Scan**:
A collection of OpenRouter model, endpoint, and provider data identified by one capture time.
_Avoid_: Observation (when referring to the whole collection)

**Scan time**:
The capture time identifying a scan, independently of when or whether ORCA ingests it.
_Avoid_: Ingestion time (when referring to capture time)

**Scan pair**:
Two scans ordered as previous and next, forming the inputs for an observed transition.

**Entity observation**:
The facts recorded for one entity in a scan, including its identity and relationships.
Its scan time dates observation, independently of discovery or the upstream change itself.

**Baseline**:
The scan at which a retained timeline's knowledge begins.
It establishes what was already present when observation began, rather than when those facts first became true upstream.

**First observation**:
The earliest scan from which an entity's data was derived in a deployment's retained history.
_Avoid_: Discovery, upstream creation (when referring to the source scan)

**Discovery**:
The first ingestion of an entity's data into an ORCA deployment's retained knowledge.
Discovery belongs to that deployment and happens during ingestion, independently of when the source data was captured.

**Known**:
An entity already discovered by the deployment under consideration.
The same entity can be known to production and unknown to a development deployment.

**Catalog**:
ORCA's latest retained knowledge of each model, provider, and endpoint, including last-known facts for entities no longer present upstream.

**Ingestion**:
Acceptance of a scan pair into ORCA's retained timeline, advancing its current knowledge to the newer scan.

**ORCA clock**:
The latest accepted scan time: the observation horizon of ORCA's current knowledge.
_Avoid_: Wall clock, latest collected scan time

### Availability

**Listing**:
An endpoint's observed availability together with its associated model, provider, and provider tag at a scan time.
Models and providers have listed endpoints rather than listing states of their own.

**Previously known**:
An identity observed before the scan under consideration, including identities known at the baseline.
A model can be previously known even if no serving endpoint has previously been observed for it.

### Changes and their presentation

**Entity event**:
A self-contained account of one entity's observed changes between the scans of an accepted pair.
It is distinct from an update to the entity's current Catalog facts.

**Identity context**:
The identifying facts accompanying an entity event, including names and the relevant model, provider, and endpoint identities.

**Field change**:
An addition, removal, or update to one entity field, including a change in a string set's membership.

**Alert**:
Consumer-relevant content selected from an entity event for presentation in Monitor, Feed, or Discord.
_Avoid_: Event (when referring to the selected content)

**Batch alert**:
A group of equivalent field changes, or endpoint unlistings, across entities at the same scan time and within the same entity kind.
Its members retain their individual event identities.

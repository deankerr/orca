# ORCA

ORCA observes OpenRouter models, endpoints, and providers over time, deriving
current and cumulative knowledge from retained scans for technical OpenRouter users.

## Language

### Entities and their facts

**MEPs**:
Models, endpoints, and providers: the three entity kinds observed by ORCA.

**Entity**:
A model, provider, or endpoint whose identity and observed facts ORCA follows over time.

**Model**:
A model offering identified in ORCA by its model slug, including any variant suffix.
It can be known without ever having had listed endpoints.

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

### Source observations

**Scan**:
A collection of OpenRouter model, endpoint, and provider data identified by one capture time.
_Avoid_: Observation (when referring to the whole collection)

**Scan time**:
The capture time identifying a scan, independently of when or whether its projections are produced or retained.
_Avoid_: Ingestion time (when referring to capture time)

**Scan pair**:
Two scans ordered as previous and next, forming the inputs for an observed transition.
Their observation order is independent of the order in which pairs are processed.

**Entity observation**:
The facts recorded for one entity in a scan, including its identity and relationships.
Its scan time dates observation, independently of discovery or the upstream change itself.

**Baseline**:
A scan registration without a preceding scan, establishing complete history state at the earliest retained scan.
It describes observed state without establishing when those facts first became true upstream.

**First observation**:
The earliest scan from which an entity's data was derived in a deployment's retained history.
_Avoid_: Discovery, upstream creation (when referring to the source scan)

**Discovery**:
The first inclusion of an entity in an ORCA deployment's retained knowledge.
Discovery belongs to that deployment and occurs independently of the source scan time; adding earlier observations can move its first observation without constituting another discovery.

**Known**:
An entity already discovered by the deployment under consideration.
The same entity can be known to production and unknown to a development deployment.

**Previously known**:
An identity observed in retained knowledge before the scan under consideration, including identities known at the baseline.
This classification requires historical context beyond a scan pair.

### Transformations and projections

**Transform**:
A rule-governed derivation of one representation of ORCA data from another.
Its inputs and rules determine its output, including which facts are selected, normalized, or interpreted.

**Extraction**:
The transform from collected scan data to entity observations within ORCA's scope, establishing identities, relationships, and shared facts.
Facts omitted here are unavailable to subsequent transforms of those observations, but remain recoverable from retained source scans.

**Projection**:
A derived representation of scan data under a particular set of rules, such as current entity facts, listing transitions, price quotes, stats readings, or entity events.
Projections can share source observations without depending on one another's output.

**Scan-pair projection**:
A projection whose output is determined entirely by a specified scan pair and its transformation rules.
Each pair's output describes its own slice of observation time independently of earlier or later retained output.

**Retained projection**:
Projection output kept as part of ORCA's knowledge, remaining as produced until explicitly replaced or removed.
Changing transformation rules does not automatically revise previously retained output.
_Avoid_: Immutable (when meaning unchanged without explicit intervention)

**Reprojection**:
The explicit derivation of a new representation from retained source scans under chosen transformation rules.
Its scope can be selected independently for each projection without requiring all historical output or other projections to be revised.

**Metadata selection**:
The rules selecting which open-ended entity facts a particular projection retains.
Current-view metadata selection is independent of extraction and of the facts retained in Events.

**Product interpretation**:
The selection, derivation, and contextual meaning a product applies to the projections it consumes.
It can use the wider Catalog, including historical context beyond any individual scan pair.
_Avoid_: Projection rules (when referring specifically to a product's interpretation of retained data)

### Retained knowledge and views

**Catalog**:
ORCA's retained body of projected knowledge about models, providers, and endpoints, encompassing both current views and cumulative histories, including Events.
Its projections are shared knowledge available to products, each with its own meaning and retention rules.
_Avoid_: Current entities, current view (when referring to the whole Catalog)

**Materialized view**:
A derived view retained for convenient access rather than reconstructed from its sources whenever needed.
Its retained representation can be replaced by deriving it again from those sources.

**Current view**:
A materialized view of the latest retained entity knowledge, including last-known facts for entities no longer present upstream.
It is one representation within the Catalog, with a selectable metadata scope.
_Avoid_: Catalog (when referring only to current entity facts)

**Current stats**:
A view of endpoint readings at its latest processed scan time.
Earlier observations can extend Stats history without replacing this view with older readings.

**History**:
A cumulative series of projected observations or transitions ordered by source scan time, independently of the order in which they were retained.
Its interpretation depends on what its entries represent: continuing state, individual readings, or observed changes.

**Listing history**:
Entity presence and endpoint relationship state over retained observation time.
State continues between observed transitions within the supported history.

**Pricing history**:
Complete endpoint price quotes over retained observation time.
Quote continuity is interpreted together with historical endpoint availability and relationships.

**Stats history**:
Endpoint metric readings at their source scan times, including repeated values.
An absent reading supplies neither a carried-forward value nor a zero.

### Processing and product readiness

**Ingestion**:
The process of deriving and retaining projections from source scans.
The term describes an activity, without implying a single acceptance event or simultaneous completion of all projections.
_Avoid_: An ingestion (when referring to a scan pair, its output, or its processing progress)

**Ingestion target**:
The inclusive range of source scan times from which a deployment is requested to derive Catalog knowledge.
It expresses requested coverage independently of progress or readiness; reducing it does not remove retained knowledge.

**Scan registration**:
The record of a scan introduced for projection, together with its preceding scan unless it is a baseline.

**Registration**:
The acceptance and recording of a scan for ingestion.
Registration fixes the selected scan times without implying that ingestion processes have completed.

**Backfill**:
The addition of projections from earlier source observations to extend retained history.
Scan-pair projections can be produced in reverse chronological order while each pair retains its previous-to-next meaning.

**Observation horizon**:
The scan time through which a particular view or product represents knowledge.
It is distinct from wall time, processing time, and the latest collected scan time.

**ORCA clock**:
The observation horizon used as ORCA's reference for current knowledge.
It does not certify that every projection or product has progressed to that horizon.
_Avoid_: Wall clock, latest collected scan time

**Ingestion process**:
An operation that derives and retains a particular part of Catalog knowledge from selected scans.
Completion includes retaining its results, even when there are no resulting changes.

**Readiness**:
A product's assessment that its required projections are sufficient for a chosen observation horizon.
It is derived from those dependencies and the product's tolerance for differences in their progress, rather than being one Catalog-wide state.

### Availability

**Listing**:
An entity's observed presence in a scan, including the associated model, provider, and provider tag for an endpoint.
Models and providers are present exactly while they have listed endpoints.

### Changes and their presentation

**Entity event**:
A self-contained projection of one entity's observed changes between the scans of a pair, including the identity context needed to describe them.
It describes that transition independently of historical classifications such as whether the entity was previously known.

**Events**:
The retained historical series of entity events, forming one projection within the Catalog.
Other Catalog projections derive from source scans independently of this series.

**Identity context**:
The identifying facts accompanying an entity event, including names and the relevant model, provider, and endpoint identities.

**Field change**:
An addition, removal, or update to one entity field, including a change in a string set's membership.

**Alert**:
Product-relevant content derived from entity events and interpreted using Catalog context as needed.
Its presentation and any retained state belong to the consuming product, such as Monitor, Feed, or Discord.
_Avoid_: Event (when referring to the selected content)

**Batch alert**:
A group of equivalent field changes, or endpoint unlistings, across entities at the same scan time and within the same entity kind.
Its members retain their individual event identities.

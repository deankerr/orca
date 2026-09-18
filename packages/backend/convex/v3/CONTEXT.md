# ORCA

ORCA observes OpenRouter models, endpoints, and providers over time.

## Language

**Scan**:
A collected observation of upstream model and endpoint data at a particular time.

**Scan artifact**:
The stored data from a scan, identified by its artifact identity and scan time.

**Projection**:
Data derived from scans for use by ORCA products.

**Ingestion**:
Processing a scan artifact into projections.

**Ingestion record**:
A record identifying a completed ingestion, which may be imported from another deployment.
Ingestion records need not form a continuous history on a deployment.

**Current scan**:
The scan identified by the latest ingestion record available on a deployment.

**ORCA clock**:
The current scan's scan time.

**Stats reading**:
An endpoint's supplied performance measurements in one scan.

**Scan stats**:
All endpoint stats readings for a particular scan time.
_Avoid_: Slice

**Current stats**:
Endpoint performance readings supplied in the scan at the ORCA clock.
An endpoint without a reading in that scan has no current stats.

**Pull**:
An import of source projections needed by development and preview products.
A pull supplies current product data and selected history without replicating the source environment.

## Change Event Streams

**CES ingestion**:
Preparation and retention of change event inputs from projected comparisons, with minimal interpretation.

**Batch**:
The changes derived from one source comparison, identified by its observation interval; a batch may be empty.

**Change event input**:
An independently identified, indivisible processing input carrying assigned values and evidence
of change; its source pair, entity, and category identify the same observation.
_Avoid_: Observed change, job, ingested event

**Evidence**:
Observations and context supporting a change event input or event, carried directly or by reference.

**Lifecycle change**:
An entity's appearance or disappearance in the observed catalog.

**Pricing change**:
A change to the pricing of an existing entity.

**Attribute change**:
A change to non-pricing fields of an existing entity; stored with category `attributes`.

**Processing**:
The CES phase that considers change event inputs using stateful rules and constructs events.
_Avoid_: Publication (as a phase name)

**Event**:
A durable, structured account of changes to ORCA entities, ready for presentation and linked to inputs.
Change event inputs and events can have one-to-one, many-to-one, or one-to-many relationships.
_Avoid_: Ingested event, published event

**Processed input**:
A change event input whose interpretation is permanently finished, with or without an event.

**Deferred input**:
An unprocessed change event input retained for reconsideration on every processing run.

## Products

**Alerts**:
ORCA's curated notification stream of announcement-worthy occurrences.

**Monitor**:
A working name for the intended web presentation of Alerts, showing the same notification content
with ORCA's own styling.

**Endpoints Data Grid**:
The browsing interface for the most current endpoint catalog data available to ORCA,
independent of notification selection and publication.

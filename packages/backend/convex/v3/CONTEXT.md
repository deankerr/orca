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
Preparation and retention of jobs from projected comparisons, with minimal interpretation.

**Batch**:
The jobs derived from one source comparison, identified by its observation interval; a batch may be empty.

**Job**:
An independently identified, indivisible unit of work asking CES to consider an observed change,
with assigned changes and supporting evidence; its source pair, entity, and category identify the same work.
_Avoid_: Ingested event

**Evidence**:
Observations and context supporting a job or event, carried directly or identified by reference.

**Lifecycle job**:
A job concerning an entity's appearance or disappearance in the observed catalog.

**Pricing job**:
A job concerning pricing changes to an existing entity.

**Update job**:
A job concerning non-pricing changes to an existing entity.

**Processing**:
The CES phase that considers jobs using stateful rules and constructs events.
_Avoid_: Publication (as a phase name)

**Event**:
A durable, structured account of an occurrence, ready for presentation and linked to supporting jobs.
Jobs and events can have one-to-one, many-to-one, or one-to-many relationships.
_Avoid_: Ingested event, published event

**Complete job**:
A job whose work is permanently finished, whether or not it contributed to an event.

**Deferred job**:
An unfinished job retained for reconsideration on every phase 2 run.

## Products

**Alerts**:
ORCA's curated notification stream of announcement-worthy occurrences.

**Monitor**:
A working name for the intended web presentation of Alerts, showing the same notification content
with ORCA's own styling.

**Endpoints Data Grid**:
The browsing interface for the most current endpoint catalog data available to ORCA,
independent of notification selection and publication.

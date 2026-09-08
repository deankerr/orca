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

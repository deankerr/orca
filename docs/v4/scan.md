# Scan

Owns capture, discovery and extraction of scan artifacts into scoped entity observations.

Capture, artifact storage and discovery use the existing shared `convex/scan/` module. V4 adds
extraction of those stored artifacts, not a separate capture action or object-store write path.

## Artifact contract

One artifact is the authoritative captured model/endpoint input at a real scan time.

### Storage

| Property     | Contract                                                                        |
| ------------ | ------------------------------------------------------------------------------- |
| Address      | `{ path: 'scans', name: 'scan.<scan_at>.jsonl' }`                               |
| Retrieval    | Existing `objects_locators` table and named-object store in `objects`           |
| Contents     | Complete captured inputs, including data outside current product scope          |
| Availability | Durable evidence for reproduction and inspection beyond retained derived fields |

Reuse the existing `scan` and object-store interfaces. Addressing, storage location and compression
remain private to this module.

### Identity and time

- Capture time is the artifact's domain identity; copies preserve it across deployments.
- All scan times are canonical UTC strings. Writers validate the format beyond `v.string()`.
- Conflicting content at the same capture time fails validation.
- Artifact availability advances independently of the [ingestion clock](ingestion.md#clock-reads).

## Loaded dataset

- Artifact loading admits models supporting both text input and text output, together with their endpoints.
- Apply this filter before provider extraction and deduplication; only admitted occurrences can select
  a provider's value.
- Extraction receives this scoped dataset; downstream modules take scope as an output guarantee.
- Complete captured artifacts remain available for inspection and future derivation outside this scope.

## Extraction

Extraction unwraps the admitted artifact into entity observations and supplied readings. Its output
is the entity source for downstream modules; understanding upstream nesting is private to Scan.

- Establish native model/provider identities and endpoint UUIDs, with endpoint relationships stored
  separately from the related entity bodies.
- Select the last provider occurrence in the admitted encounter order before entity comparison.
- Remove known redundant entity bodies; retain provider facts in the selected provider observation.
- Rename the endpoint's `provider_slug` to `provider_tag`, removing the ambiguous source name from
  the extracted endpoint. The tag targets inference requests and is never a provider identity.
- Preserve scan-derived extras needed for later interpretation alongside extracted source facts.
  Model `variant` can remain payload metadata; `model_id` is the variant-aware identity.
- Separate `stats` and supplied `statsByTier` samples from endpoint values into Readings.
- Validate deliberately required identity, relationship and entity facts. Preserve other JSON
  content without imposing database key restrictions or validating hypothetical product uses.

The extracted payload is an ORCA entity observation, not a verbatim upstream body. Structural
corrections belong here; selection of prices and interpretation of optional facts belong to
[Projections](projections.md). Records and live-scan projection consume the same entity contract.

## Operations

| Operation       | Result or completion condition                                          |
| --------------- | ----------------------------------------------------------------------- |
| `capture`       | Completes after the full artifact is durable.                           |
| `next`          | Discovers the next available observation.                               |
| `load(scan_at)` | Verifies identity and extracts scoped entity observations and readings. |

A deployment can start from any selected real pair. [Initialization](ingestion.md#initialization)
uses its earlier artifact directly for the baseline.

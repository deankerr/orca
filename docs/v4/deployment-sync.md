# Deployment sync

Records options for selecting and moving deployment-local state from the shared observation timeline.

This workflow is deferred under [implementation stages](stages.md). Event-related options below
are future considerations; they prescribe no current event schema or execution protocol.

## Transfer options

Choose a strategy and coverage when a concrete workflow emerges from implementation experience.

| Strategy                                         | Useful result                                                           |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| Copy scan artifacts, then ingest selected pairs  | Reproduce values through the same pure derivation and a local baseline. |
| Copy retained records and owning ingestion state | Establish a selected historical dataset directly.                       |
| Copy cache rows or selected publications         | Bring up product-facing data independently of raw-record coverage.      |
| Combine strategies                               | Provide a useful preview with additional source data for later work.    |

🚧 Transport, import automation and synchronization guarantees follow that workflow. The initial
schema carries no transfer-specific state.

## Coverage

| Dataset                          | Entering state requirement                                                 |
| -------------------------------- | -------------------------------------------------------------------------- |
| Self-contained historical window | Include entering entity/price/listing state and changes inside the window. |
| Deliberately partial dataset     | Make the retained coverage an explicit choice.                             |

- A timestamp filter alone omits unchanged values needed by a self-contained window.
- Selected endpoint history includes its required model/provider context at the relevant times.
- A retained-state import establishes an earliest ingestion owning its entering baseline.
- Raw-record imports honor [Ingestion's admission and ownership contract](ingestion.md#ingestions).

## Identity and process-state mapping

| Value                               | Transfer rule                                                                    |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| Scan times and artifact identity    | Preserve real observation identity.                                              |
| Natural scan-pair/entity identities | Portable between deployments.                                                    |
| Convex IDs                          | Remap deployment-local references when copying related tables.                   |
| Ingestion progress                  | Map deliberately to coherent local progress and current Catalog state.           |
| Cache context times                 | Preserve the source context described by each row.                               |
| Future event publications           | Revisit preservation of claim meaning and publication time during Events design. |

## Destination behavior

- Event interpretation and delivery remain local decisions. Resuming ingestion requires a coherent
  current Catalog and completed clock, since routine updates assume all previous pairs were applied.
- Importing data alone creates no broadcast obligation; delivery rules belong to the deferred
  [Events and consumer design](change-events.md).
- Copying mutable current tables across batches can expose mixed freshness, as ingestion does.

🚧 Automate window extraction, import validation and ID remapping with the chosen workflow.

🚧 Coherent cross-table exports and atomic destination publication follow an actual requirement.

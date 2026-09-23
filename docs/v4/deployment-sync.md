# Deployment sync

Records options for selecting and moving deployment-local state from the shared observation timeline.

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

| Value                               | Transfer rule                                                              |
| ----------------------------------- | -------------------------------------------------------------------------- |
| Scan times and artifact identity    | Preserve real observation identity.                                        |
| Natural scan-pair/entity identities | Portable between deployments.                                              |
| Convex IDs                          | Remap deployment-local references when copying related tables.             |
| Ingestion process state             | Map deliberately to local state; a copied active claim has no local owner. |
| Cache context times                 | Preserve the source context described by each row.                         |
| Event claims and `published_at`     | Preserve the publication's selected meaning and original storage time.     |

## Destination behavior

- Local refresh, interpretation and delivery remain independent decisions.
- Importing data alone creates no broadcast obligation; [delivery adapters](change-events.md#delivery-adapters)
  apply their own rules.
- Copying mutable caches across batches can expose mixed freshness, as local refresh does.

🚧 Automate window extraction, import validation and ID remapping with the chosen workflow.

🚧 Coherent cross-table exports and atomic destination publication follow an actual requirement.

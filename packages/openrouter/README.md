# `@orca/openrouter`

Independent OpenRouter catalog reader for ORCA.

The package encapsulates the upstream catalog and endpoint request shapes, retries, identity
validation, filtering, and the `raw endpoints -> { model, endpoints }` normalization. Endpoint
rows have only their duplicated, unhealed embedded model removed; every other decoded upstream
field passes through intact so field churn does not require an exclusion list. Consumers receive a
timestamped `CatalogSnapshot` and do not need to understand OpenRouter's embedded model or endpoint
response structure.

The package entrypoint exports only:

- `OpenRouterCatalog` and its live/default-HTTP layers;
- `OpenRouterCatalogError`;
- normalized `Model`, `Endpoint`, `CatalogScope`, and `CatalogSnapshot` schemas and types.

Raw upstream schemas remain private implementation details so they can track OpenRouter without
creating downstream package contracts.

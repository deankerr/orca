# V4-specific conventions

## Compatibility

- Registered public function paths are consumer-facing names.
- V3 is the behavioral reference for the product replacement.
- Existing V3 naming and file layout do not constrain V4.
- Table names use snake_case with a temporary `v4_` prefix.

## Orchestration names

- Registered function paths must explain their purpose in the dashboard and CLI.
- Name manual commands for their effect and target: `drainArtifacts`, `initializeCatalog`,
  `startModule`, `catchUpModule`.
- `commit…` functions are processor transaction steps, not independent operator commands.
- Progress queries are read-only and internal; they do not start or advance processing.
- Keep transaction steps beside the workflow that owns their ordering.

## Interpretation

- Scan resolves source identities once; consumers use the established Scan types.
- Repeated entity observations select a winner rather than require consistency assertions.
- Required facts are validated by the consuming module.
- Catalog and History share pricing selection and its storage representation.
- Chart segmentation, units and sampling belong to consumers.

## Documentation

Code owns schemas, indexes, signatures and local mechanics.

These docs retain V4-specific decisions, rationale and unimplemented intentions.

General design guidance belongs to the codebase-design and code-correctness skills.

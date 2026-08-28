# Scripts

- [`bundle-analysis/README.md`](bundle-analysis/README.md) — validate bundle structure and derive adjacent transitions.
- [`json-profile/README.md`](json-profile/README.md) — profile observed JSON shapes and values without imposing a schema.
- [`reversible-changesets/README.md`](reversible-changesets/README.md) — compare and verify reversible delta formats over normalized bundles.

## Bundle data

- Bundles live in `../../data/bundles` as `.json.gz`; a current snapshot is roughly 7–8 MB uncompressed and 0.75–0.8 MB compressed.
- The directory contains an older sparse cadence and a later dense cadence (from 2026-08-16); use the dense series for representative archival analysis.
- After parsing, normalize the top-level `data` array by `model_id` and each model's non-null `endpoints` array by endpoint identity. Neither collection's order is meaningful or needs to be recovered.
- Bundle schemas can change without warning. Treat unknown fields generically and preserve a complete snapshot as the durable fallback for any optimization.
- Diffing two complete parsed bundles at a time is the realistic baseline. Write per-transition output as it is produced; never retain corpus-wide bundles, changesets, or reports in memory.

Run `bun run fix` from the repository root for validation.

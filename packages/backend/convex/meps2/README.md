# meps2

Design-in-code rewrite of the core backends components.

- Tables are prefixed with `meps2_`.
- Scan JSONL is stored through `objects`. Other meps2 code stays in this directory.
- Slices may need to be partially built, and sit in an unintegrate state until other slices are ready.
- Nothing is locked in - we will continue to shift the interfaces, boundaries, and data structures until we find the right balance.
- Dev data does not need to be preserved. Now is the time to make breaking schema changes.

Intended design: [`docs/`](docs/). Index: [`docs/glossary.md`](docs/glossary.md).
OpenRouter observation notes: `docs/openrouter`.

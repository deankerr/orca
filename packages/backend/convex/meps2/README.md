# meps2

Design-in-code rewrite of the core backends components.

- Tables are prefixed with `meps2_`.
- Should not interact with code or data outside of the `meps2` directory.
- Slices may need to be partially built, and sit in an unintegrate state until other slices are ready.
- Nothing is locked in - we will continue to shift the interfaces, boundaries, and data structures until we find the right balance.
- Dev data does not need to be preserved. Now is the time to make breaking schema changes.

Intended design: [`docs/`](docs/). OpenRouter observation notes: `docs/openrouter`.

Workflow orchestration and exception handling should remain simple and fail fast at this stage.

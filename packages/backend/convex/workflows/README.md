# Workflows

**DRAFT: Adapt as more workflows are added**

Workflows are newer backend processes that preserve raw workflow outputs as objects or materialize app state from those objects.

## Shape

Each workflow should expose clear starting points and a predictable process action:

- `manual:start` is the dashboard and CLI entrypoint for an intentional human run.
- `scheduled:start` is the cron entrypoint and decides whether the workflow should run now.
- `process:run` is the core action. It requires explicit args and starts work immediately.

## Responsibilities

Start actions may:

- Read env/config.
- Gate cadence.
- Resolve optional human input.
- Normalize timestamps.
- Schedule `process:run` with complete args.

Start actions should not:

- Fetch external data.
- Store objects.
- Materialize projections.
- Contain resume or pagination loops.

Process actions should:

- Require all operational args.
- Avoid setup decisions that belong in a start action.
- Be safe to call from manual and scheduled starts.
- Reschedule themselves with explicit continuation args if processing must continue.

## Objects

Raw workflow results are stored through `objects`. Callers choose `(path, name)` and pass uncompressed JSON text, including any envelope (`workflow`, `timestamp`, `format_version`, `data`). Compression and the backend stay inside `objects`.

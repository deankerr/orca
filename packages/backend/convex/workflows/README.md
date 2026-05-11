# Workflows

**DRAFT: Adapt as more workflows are added**

Workflows are newer backend processes that preserve raw workflow outputs as R2 artifacts or materialize app state from those artifacts.

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
- Store R2 artifacts.
- Materialize projections.
- Contain resume or pagination loops.

Process actions should:

- Require all operational args.
- Avoid setup decisions that belong in a start action.
- Be safe to call from manual and scheduled starts.
- Reschedule themselves with explicit continuation args if processing must continue.

## Artifacts

Raw workflow results should be stored through `lib/r2.ts`.

The R2 service owns artifact identity. Callers provide `workflow`, `timestamp`, `format_version`, and uncompressed JSON-compatible `data`; the service creates `artifact_id` and stores the gzipped JSON envelope.

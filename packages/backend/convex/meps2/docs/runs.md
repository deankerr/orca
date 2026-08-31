# Runs

A **run** is one attempt to execute a workflow. It is not an artifact. `runs` records lock,
duration, error, and whether apply finished.

## Fields

- `workflow` — for this workflow, `scan`
- `status` — `running` | `succeeded` | `failed`
- `started_at` / `completed_at` — unix ms process clock
- `error` — set on `failed`
- `stats` — optional counters from a finished attempt
- `artifact_id` — set once the artifact is stored

## Status

- `succeeded` means the artifact was stored **and** applied.
- `failed` with `artifact_id` set means the file exists and was not applied.
- `failed` without `artifact_id` means no file was stored.
- 🧭 `artifact_id` on a run does not make that artifact the baseline. Only `succeeded` does.

## Baseline

The baseline for a scan compare is the artifact of the latest `succeeded` scan run.

- First scan: empty maps.
- A later scan does not use a stored-but-unapplied file as `before`.
- ⚠️ Latest row in `artifacts` is not the baseline.

## Sequence

A scan run proceeds in this order. Later steps do not run if an earlier step fails.

1. Insert a `running` run. Refuse if another scan run is `running` and not stale. Fail and
   take over a stale `running` run.
2. Assign `scan_at`.
3. Fetch and serialize the scan artifact (`scan`).
4. `artifacts.store` with path `scan`. Record `artifact_id` on the run.
5. Load baseline bytes via `artifacts.load` with path `scan` and the latest `succeeded` scan
   run's `artifact_id`.
6. Project and apply (`projections`, `projections/apply`).
7. Mark the run `succeeded`.

- Fetch failure → `failed`, no `artifact_id`, that `scan_at` unused.
- Store failure → `failed`, no `artifact_id`.
- Apply failure → `failed`, `artifact_id` set, baseline unchanged.
- 🧭 Never store twice with the same `scan_at`.

## Concurrency

- One `running` scan at a time.
- ❓ How old a `running` run must be before takeover stays open. Tune it in operation.

## Replay

An unapplied artifact is a real observation. Apply can run against it without a new fetch.

- Replay does not assign a new `scan_at`.
- Replay does not write a second artifact.
- ❓ Whether replay is a new run that skips fetch/store, a flag on `scan`, or a distinct
  workflow stays open. It must still leave a `succeeded` run pointing at the existing
  `artifact_id`, or baseline stays wrong.
- Series apply for a given `scan_at` is idempotent. See [`series.md`](series.md).

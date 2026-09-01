# Module: Orchestrate

The only module that knows the live sequence. Domain modules stay free of the
workflow component. The journal holds identities, never bytes or Catalog maps.
Stats and errors go to `console.log` / `console.error`.

Two workflows so a later hour can checkpoint while apply is still running:

- **observe** — `scan` → store → register → kick off drain. `scan_at` is assigned
  in `start`. Action retries are off. Fetch or store failure: that `scan_at` is
  unused.
- **drain** — latest-edge apply of registered-not-ingested files. `applyNext`
  peeks `nextAfter(latest)` and re-peeks if that step restarts, then
  `markIngested`. Action retries are off.

Cron calls `observe.start`. `drain.start` is the dashboard/CLI unblock after a
failed apply. Observe kickoffs drain after register.

## Occupancy

Separate keys: `observe` and `drain:${path}`. Presence of a `meps2_locks` row is
the lock.

- Observe `start` lets `claim` throw (at most one observe).
- Drain `start` no-ops if held or there is no neighbor. Success `onComplete`
  re-arms if work remains (peek-empty while observe is about to register).
- Failed drain releases the lock; the window stays. Call `drain.start` after the
  fix.
- ⚠️ Catch `claim` via `ctx.runMutation`. Catching `.unique()` in the mutation
  that inserted would commit the extra row.

## Invariants

- Re-peek after every `markIngested`. A file registered during the drain is
  eligible.
- ⚠️ `applyNext` takes only `path`. A journaled `after` would skip a concurrent
  register.
- Apply writes are idempotent on `scan_at`. A crash between writes and
  `markIngested` replays, then advances the window.
- Drain batches then completes so the journal stays bounded. Batch size is a knob.
- Failed observe: next `start` assigns a new `scan_at`. Failed drain: the window
  is the checkpoint.

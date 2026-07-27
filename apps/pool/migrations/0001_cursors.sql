-- One row per consumer. This table is a derived, rebuildable cache, not a system of record:
-- losing it costs every consumer a replay from zero, which is a cost rather than a corruption.
--
-- `cursor` is an exclusive lower bound on `__ingest_ts` — the pool's own arrival axis, never
-- `observed_at`. A consumer has processed everything at or before its cursor and nothing after it.
-- A new consumer starts at the epoch and backfills the whole pool for free (artifact-pool.md §6).
CREATE TABLE IF NOT EXISTS consumers (
  name               TEXT    PRIMARY KEY,
  cursor             TEXT    NOT NULL DEFAULT '1970-01-01T00:00:00.000Z',
  -- How far behind the pool head this consumer may fall before it counts as stalled. The whole
  -- point of §7: independent dials mean a consumer can stall silently while everything upstream
  -- looks healthy, so every consumer has to declare what "too far behind" means for it.
  lag_budget_seconds INTEGER NOT NULL,
  -- When the cursor last moved. A cursor that is behind *and* not moving is the alarm; a cursor
  -- that is behind but advancing is just a consumer working through a backlog.
  updated_at         TEXT    NOT NULL
) STRICT;

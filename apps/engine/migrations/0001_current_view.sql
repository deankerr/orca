-- Worker-side current cache: latest observation per model-variant scope.
-- Observation-adjacent (ids + raw OpenRouter payloads), not product / orca-legacy cards.
-- Disposable — rebuildable from the R2 archive.

CREATE TABLE scopes (
  key TEXT PRIMARY KEY NOT NULL,
  -- ScopeObservation JSON: { "endpoints": [ { "id", "payload" }, ... ] }
  observation_json TEXT NOT NULL,
  endpoint_count INTEGER NOT NULL,
  observed_batch TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

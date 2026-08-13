-- Current V2 model documents for the public API projection.
-- Disposable; rebuildable from archive. No history.

CREATE TABLE models (
  id TEXT PRIMARY KEY NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX models_by_updated_at ON models (updated_at);
CREATE INDEX models_by_created_at ON models (created_at);

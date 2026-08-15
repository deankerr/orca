-- Disposable V2 projection. A source ETag becomes visible only after all of its rows are complete.

CREATE TABLE models (
  source_etag TEXT NOT NULL,
  id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (source_etag, id)
) STRICT;

CREATE INDEX models_by_source_etag_created_at ON models (source_etag, created_at DESC);

CREATE TABLE projection_state (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  source_etag TEXT NOT NULL,
  observed_at TEXT NOT NULL
) STRICT;

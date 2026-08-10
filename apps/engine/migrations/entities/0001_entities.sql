-- Thin temporal awareness of entities seen in successful captures.
-- Not a product grid; not unavailability policy.

CREATE TABLE scopes (
  key TEXT PRIMARY KEY NOT NULL,
  first_detected_at TEXT NOT NULL,
  last_detected_at TEXT NOT NULL
) STRICT;

CREATE TABLE endpoints (
  id TEXT PRIMARY KEY NOT NULL,
  scope_key TEXT NOT NULL,
  first_detected_at TEXT NOT NULL,
  last_detected_at TEXT NOT NULL
) STRICT;

CREATE INDEX endpoints_by_scope ON endpoints (scope_key);

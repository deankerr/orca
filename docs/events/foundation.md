# Foundation

- One event keeps an entity's changes for one ingestion together, including accompanying price and capability changes.
- The ingestion pair bounds when ORCA observed a transition; event rows carry `scan_at`, when the change became known. An ADD can accompany an upstream `created_at` from an earlier day.
- The baseline establishes initial knowledge; events describe subsequent transitions.
- The stable address is `scan_at` + `entity_kind` + `entity_id`. It survives representation changes. The ingestion record permanently fixes the predecessor, so events need no copy of `from_scan_at`.
- Generation uses the supplied observation pair; interpretation uses the event's own facts and [context](context.md).
- [Projection concerns](projections.md) connect Events to the wider V4 approach to shared interpretation and revisable history.

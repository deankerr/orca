# Foundation

- One event keeps an entity's changes for one ingestion together, including accompanying price and capability changes.
- Pair times bound when ORCA observed a transition. An ADD can accompany an upstream `created_at` from an earlier day.
- The baseline establishes initial knowledge; events describe subsequent transitions.
- The stable address is `from_scan_at` + `scan_at` + `entity_id`, within the entity kind's namespace. It survives representation changes.
- Generation uses the supplied observation pair; interpretation uses the event's own facts and [context](context.md).
- [Projection concerns](projections.md) connect Events to the wider V4 approach to shared interpretation and revisable history.

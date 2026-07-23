# Data Architecture Rework

Working notes from a study of ORCA's snapshot pipeline, data model, and what the app actually
asks of them (July 2026). The conclusion: the system stores far too much and can access far too
little, and the projected schema is rigid in ways that fight the product's core promise (history).

- [current-system.md](current-system.md) — how the pipeline works today, measured statistics, friction points.
- [direction.md](direction.md) — the proposed capture/artifact strategy, and open questions.

## Status

- The existing Convex pipeline marches on unchanged; nothing here is urgent or coupled to it.
- The new system is an experiment first — it need not integrate with the old one at all.
  The old system is a guide for direction, not a migration constraint.
- First move: spin up Layer 0 (capture), which has its own open questions that are easier to
  answer with a running collector. In parallel: explore the existing dataset via a snapshot
  dump from the Convex backend.

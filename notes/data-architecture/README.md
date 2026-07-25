# Data Architecture Rework

Working notes from a study of ORCA's snapshot pipeline, data model, and what the app actually
asks of them (July 2026). The conclusion: the system stores far too much and can access far too
little, and the projected schema is rigid in ways that fight the product's core promise (history).

- [openrouter.md](openrouter.md) — 🧭 the hitchhiker's guide to OR's data model: vocabulary,
  entities, landmines, open questions. Start here.
- [current-system.md](current-system.md) — how the pipeline works today, measured statistics, friction points.
- [direction.md](direction.md) — the proposed capture/artifact strategy, and open questions.
- [provider-identity.md](provider-identity.md) — ⚠️ how provider identity actually works (org vs
  provider record vs endpoint targeting key); read before touching any `provider_*` field.
- [modality-split.md](modality-split.md) — how non-LLM offerings (image, video, speech, …)
  distort endpoint fields and pricing; which fields carry signal per modality group.

## Status

- The existing Convex pipeline marches on unchanged; nothing here is urgent or coupled to it.
- The new system is an experiment first — it need not integrate with the old one at all.
  The old system is a guide for direction, not a migration constraint.
- First move: spin up Layer 0 (capture), which has its own open questions that are easier to
  answer with a running collector. In parallel: explore the existing dataset via a snapshot
  dump from the Convex backend.
- `apps/capture` is live: an Alchemy v2 (Effect) stack — R2 bucket + Worker + Workflow — capturing
  `raw/<captured_at>/{models.json.gz, observations/*.jsonl.gz, capture.json}` every 15 minutes,
  in shadow alongside the existing pipeline. Passes are identified by ISO `captured_at`, not
  timestamp crawl_ids. Verified end-to-end 2026-07-23.

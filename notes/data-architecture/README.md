# Data Architecture Rework

Working notes from a study of ORCA's snapshot pipeline, data model, and what the app actually
asks of them (July 2026). The conclusion: the system stores far too much and can access far too
little, and the projected schema is rigid in ways that fight the product's core promise (history).

- [openrouter.md](openrouter.md) — 🧭 the hitchhiker's guide to OR's data model: vocabulary,
  entities, landmines, open questions. Start here.
- [current-system.md](current-system.md) — how the pipeline works today, measured statistics, friction points.
- [direction.md](direction.md) — the proposed capture/artifact strategy, and open questions.
- [normalized-store.md](normalized-store.md) — how canonical entities are stored (SCD2 versions
  over R2 artifacts), how the Engine and consumers read them, alternatives, open questions.
- [provider-identity.md](provider-identity.md) — ⚠️ how provider identity actually works (org vs
  provider record vs endpoint targeting key); read before touching any `provider_*` field.
- [modality-split.md](modality-split.md) — how non-LLM offerings (image, video, speech, …)
  distort endpoint fields and pricing; which fields carry signal per modality group.

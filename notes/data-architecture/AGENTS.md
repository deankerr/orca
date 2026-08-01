# Data Architecture Rework

- We are prototyping. Nothing is set in stone.
- We have all of Cloudflare's constantly evolving feature set available to us.

Working notes from a study of ORCA's snapshot pipeline, data model, and what the app actually
asks of them (July 2026). The conclusion: the system stores far too much and can access far too
little, and the projected schema is rigid in ways that fight the product's core promise (history).

- [openrouter.md](openrouter.md) — 🧭 the hitchhiker's guide to OR's data model: vocabulary,
  entities, landmines, open questions. Start here.
- [alchemy.md](alchemy.md) — Stand up infrastructure. Tear it down just as fast.
- [current-system.md](current-system.md) — how the pipeline works today, measured statistics, friction points.
- [module-design.md](module-design.md) — the engine's modules and seams: what the design pass
  changed, what it deliberately left shallow.
- [direction.md](direction.md) — the layered capture/artifact architecture, the pipeline, and the
  principles and working practices everything else follows from.
- [provider-identity.md](provider-identity.md) — ⚠️ how provider identity actually works (org vs
  provider record vs endpoint targeting key); read before touching any `provider_*` field.
- [modality-split.md](modality-split.md) — how non-LLM offerings (image, video, speech, …)
  distort endpoint fields and pricing; which fields carry signal per modality group.

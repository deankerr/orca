# Data Architecture Rework

- We are prototyping. Nothing is set in stone.
- We have all of Cloudflare's constantly evolving feature set available to us.

Working notes from a study of ORCA's snapshot pipeline, data model, and what the app actually
asks of them (July 2026). The conclusion: the system stores far too much and can access far too
little, and the projected schema is rigid in ways that fight the product's core promise (history).

- [OpenRouter documentation](../../docs/openrouter/README.md) — upstream entities, identifiers,
  API behavior, pricing, policy, telemetry, and schema history.
- [alchemy.md](alchemy.md) — Stand up infrastructure. Tear it down just as fast.
- [current-system.md](current-system.md) — how the pipeline works today, measured statistics, friction points.
- [module-design.md](module-design.md) — the engine's modules and seams: what the design pass
  changed, what it deliberately left shallow.
- [direction.md](direction.md) — the layered capture/artifact architecture, the pipeline, and the
  principles and working practices everything else follows from.
- [product-events.md](product-events.md) — product-derived immutable event requirements and local
  history proof gates.
- [full-history-findings.md](full-history-findings.md) — complete replay measurements, anomalies,
  and processing corrections established from the archive.
- [product-queries.md](product-queries.md) — intended Grid/API, Monitor, Pricing History, and Alerts
  read contracts over current state and immutable events.

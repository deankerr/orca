# OpenRouter

This directory is a structured knowledge base for OpenRouter as observed through its APIs. It
exists to support implementation decisions, so prefer concise operational knowledge over an
exhaustive account of every observation.

## Note structure

Each note owns one subject. Prefer a new focused note or report over adding an unrelated section
to an existing note.

- Begin a section with one or two sentences that establish the concept.
- Follow with atomic bullets containing the details a reader must retain.
- Keep one independently useful claim in each bullet.
- Put facts about a field in that field's section.
- Put relationships between fields in a dedicated relationship section.
- Use tables only when exact mappings or measurements are easier to scan in rows.
- Move long investigations, timelines, and corpus tables into `appendix/`; link the durable
  conclusion from the subject note.

## Statement categories

Unmarked statements are established current knowledge. Mark only statements whose category changes
how a reader should use them, and place at most one marker at the start of a bullet.

- 🧭 — ORCA working rule: required interpretation or behavior in our systems
- ⚠️ — trap: a plausible interpretation that is likely to produce a wrong result
- 🔄 — volatile: upstream state that should not be treated as durable identity
- 📊 — measurement: a result scoped to a stated corpus, population, and date
- ❓ — unresolved: a material unknown that blocks or changes an implementation decision
- 💤 — deprioritized: understood but intentionally outside ORCA's current scope

Do not use a generic importance or verification marker. Importance should follow from placement and
wording; verification should follow from a concrete observation or linked report.

## Writing rules

State known behavior directly. Introduce uncertainty only when the uncertainty itself matters.

- Prefer declarative wording over `may`, `generally`, `commonly`, and similar qualifiers.
- Do not create an `❓` note for speculative doubt with no effect on a decision.
- Scope every `📊` statement with its observation date, population, and denominator where relevant.
- Do not infer operational or economic importance from property frequency alone.
- State ORCA policy as a `🧭` rule rather than presenting it as upstream semantics.
- Treat upstream observations and ORCA rules as revisable when later evidence contradicts them.
- Preserve upstream field names in backticks and OpenRouter's public terminology where it exists.
- Define local analytical terms on first use.
- Preserve exact decimal values in data and examples; do not dismiss small changes as noise without
  evidence.

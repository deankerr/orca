# meps2 design notes

This directory is the intended design for meps2. It is a knowledge base for implementation
decisions, not a description of the running code.

Each note owns one subject. Prefer a new focused note over adding an unrelated section to an
existing note.

OpenRouter observation notes remain in `docs/openrouter`. Listing semantics for vanished
endpoints are in `docs/orca/availability.md`; this directory states the meps2 names those
rules use.

## Note structure

- Begin a section with one or two sentences that establish the concept.
- Follow with atomic bullets containing the details a reader must retain.
- Keep one independently useful claim in each bullet.
- Put facts about a field in that field's section.
- Put relationships between fields in a dedicated relationship section.
- Use tables only when exact mappings are easier to scan in rows.
- Refer to modules in backticks (`artifacts`, `ingest`, `projections`). Do not specify file trees.
- Define critical interfaces in place. Do not describe the current code.

## Statement categories

Unmarked statements are accepted design. Mark only statements whose category changes how a
reader should use them, and place at most one marker at the start of a bullet.

- 🧭 — working rule: required interpretation or behavior
- ⚠️ — trap: a plausible interpretation that is likely to produce a wrong result
- 🔄 — volatile: upstream state that is not durable identity
- ❓ — unresolved: a material unknown that blocks or changes an implementation decision
- 💤 — deprioritized: understood but intentionally out of scope

Do not use a generic importance or verification marker.

## Writing rules

State the intended system directly. Introduce uncertainty only when the uncertainty itself
matters.

- Prefer declarative wording over `may`, `generally`, `commonly`, and similar qualifiers.
- Do not create a `❓` bullet for speculative doubt with no effect on a decision.
- Place `❓` bullets inline with their subject, not in a trailing list.
- State policy as a `🧭` rule when it could be mistaken for an upstream fact.
- Preserve upstream field names in backticks.
- Define local terms on first use; canonical names live in [`identity.md`](identity.md).

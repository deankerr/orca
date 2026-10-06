---
name: orca-docs
description: Write, review, and maintain ORCA documentation, including deciding what to remove or update after code changes.
---

# ORCA documentation

Except for the root README, write for agents and project/technology experts.
Assume they can inspect code and locate information with ripgrep.

- Document durable decisions, reasons, external evidence, and operational constraints.
  Let code explain implementation, types, and control flow. Prefer a clearer name
  or a nearby comment when the information belongs with the code.
- Update docs when a documented fact becomes wrong or a durable decision changes.
  A code change alone is insufficient reason to add prose.
- When code is removed or redesigned, delete guidance tied to the old design.
  Describe the resulting system; never turn a discarded implementation into a new
  prohibition. Readers should need no knowledge of the previous design.
- State what is. Scrutinize “not”, “does not”, and “should not” clauses; retain
  exclusions only for critical constraints or likely misunderstandings.
- Give each fact one home. Remove repetition across docs and instructions.
- Let directory listings and search provide navigation. Omit documentation indexes
  and Markdown links. Use plain paths or searchable names when references help.
  AGENTS.md may point to essential documentation or the relevant area.
- Prefer short bullets with one useful point each. Make policy explicit rather
  than burying it in prose. Use tables for compact references and comparisons.
- Keep operational instructions to prerequisites, commands, and meaningful consequences.
  File names and their uses can help; implementation walkthroughs rarely do.
- Preserve surprising limitations and the evidence behind decisions. Distinguish
  observations from policy and scope measurements by date and population.

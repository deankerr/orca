# meps2 design notes

Architecture: why a module exists, invariants, traps, open questions. Not a
description of the running code.

OpenRouter notes: `docs/openrouter`. Do not repeat them. Index:
[`glossary.md`](glossary.md). Other notes link only there.

## Notes

One subject each. Prefer one complete note over a hop.

- Cross-cutting names live in the glossary. Module-local names live in that note.
- Implemented behavior lives in the code. No table fields, indexes, or mutation
  walkthroughs that match the source.
- Unimplemented, atypical, or trap-worthy work keeps enough prose to implement.

## Shape

Lede, then bullets. One claim per bullet. Tables only for mappings.

## Statement Tags

Unmarked bullets are accepted design. Tag only when the category changes how the
reader uses the line. At most one tag, at the start of a bulleted statement.
Never inline in a paragraph.

- ⚠️ trap: a plausible reading produces a wrong result
- ❓ unresolved: blocks or changes an implementation decision (not speculative doubt)
- 🚧 unimplemented: the rule is known; the code is not
- 💤 deprioritized: understood, out of scope

## Voice

State the system directly. A negative is a ⚠️ only when the misreading is known. Do not explain by
listing what a thing is not.

# Field context

- Proposed: capture surrounding before/after facts so a renderer can explain a change in context.
- A changed input price could carry the full old/new pricing, including output, cache, discount, and conditional rates.
- A string-set delta could carry complete old/new sets when the UI needs to show the resulting capability list.
- An endpoint reassignment could carry both old/new related names, enabling a readable relationship-change sentence.
- Lifecycle events already carry complete projected facts; UPDATEs currently retain changed facts only.
- These explanations require observation-local facts, which keeps historical meaning stable as Catalog evolves.
- ❓ Should UPDATEs capture full pricing and both old/new relationship names for historical explanations?

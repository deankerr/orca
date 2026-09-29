# Context

- Identity is the current class of context. It gives every event enough information for headings, links, and grouping, including small UPDATEs whose changes contain little identifying information.
- Context comes from one observation: next for ADD/UPDATE, previous for REMOVE. Resolving related identities on that same side also handles simultaneous model/provider/endpoint arrivals and departures.
- Captured context keeps historical events interpretable as current Catalog identities and labels evolve.
- Comparison follows entity ownership. A model rename produces a model event; an accompanying endpoint price event carries the new model name as context.
- An endpoint's provider label and tag describe its offering; the normalized provider name identifies its related entity. This preserves distinctions such as regional offerings and follows [provider identity](../orca/provider-identity.md).

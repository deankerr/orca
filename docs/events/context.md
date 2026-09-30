# Context

- Captured identity supports headings and grouping even when an UPDATE contains only a small field change.
- Context comes from next for ADD/UPDATE and previous for REMOVE; all related identities use that same observation.
- This also resolves simultaneous model, provider, and endpoint arrivals or departures.
- Historical headings retain their captured names as Catalog identities and labels evolve.
- Comparison follows entity ownership: a model rename produces a model event.
- An accompanying endpoint price event carries the new model name as context.
- Endpoint labels and tags describe offerings; normalized provider identity remains stable across label changes.
- Tags can encode regional or configuration distinctions. Resolve provider identity from the explicit relationship.

## Relationship changes

- An endpoint relationship change is selected under its next model/provider; a departure uses its last relationship.
- ❓ Should the former model/provider activity feed also surface an endpoint's relationship change?

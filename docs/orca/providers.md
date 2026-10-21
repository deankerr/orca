# Provider extraction policy

## Identity

ORCA groups routing variants by normalized provider slug. Names describe services but do not define
identity. Exact repairs precede slash-prefix grouping in `scans/extraction/providers.ts`.

- ModelRun retains continuity across host and branding changes.
- W&B retains a historical identity separate from CoreWeave.
- Claude Platform on AWS includes the earlier Anthropic 2 identity.
- Google Vertex and Google AI Studio remain distinct services.

## Representative facts

Each provider retains one complete embedded observation, preserving facts actually observed together.

1. Prefer source slugs matching the normalized identity; otherwise use all candidates.
2. Choose the most frequent display name in that pool, breaking ties lexically.
3. Use the first winning observation in model-ID then endpoint-ID order for all metadata.

Voting only on names prevents URL and unknown-field differences from splitting label votes. Sorting
removes dependence on captured array order; it establishes neither authority nor freshness.

### Tradeoffs

- Changes to unselected observations can disappear.
- Candidate membership changes can replace the representative and its metadata.
- Captures retain alternatives; the current public provider list cannot supply historical extraction evidence.

## Fact ownership

| Fact                                         | Policy                                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| Behavioral data-policy claims                | Remove from provider extraction; endpoint `data_policy` owns them.      |
| Terms/privacy URLs                           | Retain their provider meaning.                                          |
| Internal configuration and endpoint defaults | Omit from current-view metadata; Events retain broader extracted facts. |
| Unknown fields                               | Survive unless the owning transform explicitly omits them.              |

Endpoint tags, labels, capabilities, and policies retain their own observed meanings.
Provider `byokEnabled` and endpoint `is_byok` describe different scopes.

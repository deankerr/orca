# Provider extraction policy

## Identity decisions

ORCA groups routing variants into provider identities using normalized slugs. Upstream names
remain descriptive: they can span distinct services or reflect historical branding.

- ModelRun retains continuity across its host and branding changes.
- W&B retains a historical identity separate from CoreWeave.
- Claude Platform on AWS includes its earlier Anthropic 2 phase.
- Google Vertex and Google AI Studio remain distinct services; "Google Vertex" is the label for the former.

## Representative facts

One complete observation supplies each provider's facts. This preserves an observed combination
of metadata instead of assembling a synthetic record from conflicting copies.

Extraction sorts scan entries by ascending model ID and each entry's endpoints by ascending
endpoint ID, regardless of their stored order. Provider candidates follow that traversal order.

Within each provider identity, selection prefers observations whose source slug matches the
normalized provider ID, falling back to all observations when no base-slug observation exists.
The most frequent display name wins within that pool; tied names use ascending lexical order.
The first observation with the winning name in model-ID then endpoint-ID order supplies the
complete provider record.

Base-slug preference and display-name voting favor a useful service label over incidental
serving variants. Other metadata is opaque to selection, so a URL or an unknown field cannot
split a label's votes. Sorting during extraction makes selection independent of stored array
order; this ordering conveys no authority or freshness.

A conflicting change in an unselected observation can disappear. Changes in candidate membership
or labels can instead replace the representative and its metadata. Both are accepted consequences
of retaining one coherent record; raw captures preserve the other observations.

Historical replay uses embedded observations. The public provider list is outside extraction
because it cannot supply that historical evidence.

## Metadata ownership

- Endpoint data policy governs behavioral claims; provider terms and privacy URLs remain provider facts.
- Internal configuration and endpoint defaults are omitted because they vary by endpoint or describe upstream machinery.
- Endpoint routing tags, display labels, capabilities, and policies retain their observed meanings.
- Provider `byokEnabled` and endpoint `is_byok` describe different scopes.
- Unknown provider fields remain visible until evidence supports a deliberate omission.

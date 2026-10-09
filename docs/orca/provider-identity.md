# Provider identity and endpoint-local fields

ORCA uses the following ownership rules. Provider enrichment and inferred
organization/variant hierarchies are outside current product scope.

| Source                           | ORCA meaning                                                     |
| -------------------------------- | ---------------------------------------------------------------- |
| `provider_info`                  | Related normalized provider observation.                         |
| `provider_info.slug`             | Provider identity, translated to `provider_id` during assembly.  |
| `provider_info.displayName`      | Provider entity display name.                                    |
| Endpoint `provider_display_name` | Endpoint's display label, taken directly from that source field. |
| Endpoint `provider_name`         | Endpoint property, even when equal to `provider_info.name`.      |
| Endpoint `provider_model_id`     | Provider-side model identifier for this endpoint.                |
| Endpoint `provider_region`       | Endpoint region.                                                 |
| Endpoint `provider_slug`         | Opaque accessor, translated to `provider_tag` during assembly.   |

Tag suffixes and labels do not establish entity identity. For example, replacing
`Google Vertex (US)` and `Google Vertex (Global)` with their shared provider name
would discard useful endpoint distinctions.

Use endpoint data policy for behavioral claims; provider terms/privacy URLs remain
provider facts.

Model/provider metadata belongs to its normalized entity. Product rows may project
related context; historical products resolve that context at the selected observation.

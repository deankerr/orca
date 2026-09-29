# Selection and the Grid overlay

## Working scale

- September 2026 working inventory: roughly 2.8K retained endpoints, 1K models, and 159 providers. Many endpoints departed long ago; the active population is smaller.
- One event per entity per ingestion bounds the rows in a scan by the observed entity population. Even a scan-wide update fits comfortably within the document-count limits at this scale.
- Pricing dominates event volume across observed periods. An index selecting pricing changes would retain most of the same population; derive pricing involvement when interpreting fetched events.
- Design retrieval around observed ORCA history and OpenRouter behavior. An exceptional lifecycle batch hitting byte limits calls for investigation; special batching can follow demonstrated need.

## Retrieval options

- The [current queries](../../packages/backend/convex/v4/events/query.ts) use native pagination for the complete feed, exact entities, model activity, and provider activity. Each orders by descending `scan_at`; late retries appear at their observation time.
- Scan-sized reads remain an option for recent, multi-dimensional views: one bounded batch could serve several selections and compositions.
- Pagination granularity remains a product/query choice for additional readers. An index ending in `scan_at` can support both approaches.
- As selection dimensions grow, consider an indexed identity/time scope plus filtering over a bounded working set. This can accommodate several overlay controls with few indexes.
- History length is a separate dimension: longer, narrowly scoped browsing benefits from native pagination even when individual scans are small.

## Selection fields

- Endpoints join model and provider identities while owning most of the important, directly comparable facts. The Grid primarily exposes models and providers through their endpoints; selection should reflect this asymmetry.
- Exact-entity history is wanted for every kind. Model/provider activity should also include their endpoints. Endpoint-only variants remain possible, but the rarity of model/provider events gives little reason for dedicated indexes.

| Selection         | Existing fields                                      | Meaning                                                              |
| ----------------- | ---------------------------------------------------- | -------------------------------------------------------------------- |
| Exact entity      | `entity_kind`, `entity_id`                           | Changes to one model, provider, or endpoint.                         |
| Model activity    | `context.model.model_id`                             | Model changes and changes to its endpoints.                          |
| Provider activity | `context.provider.provider_id`                       | Provider changes and changes to its endpoints.                       |
| Known endpoints   | `entity_kind: endpoint`, selected `entity_id` values | Changes to offerings already identified through the Grid or Catalog. |
| Observation time  | `scan_at`                                            | Chronological ordering and time bounds for each scope.               |

- Retain `entity_id` for uniform exact-subject selection. Its duplication in the native change node and identity context preserves those representations while exposing the subject directly.
- A model/provider pair can have several endpoints. Discovering those offerings belongs to the Grid or Catalog; Events can select the known endpoint IDs. This needs no additional stored field.
- Provider IDs and endpoint tags retain their distinct meanings, including regional or configuration-specific tags.
- These fields cover the anticipated identity/time dimensions. Further index combinations remain reader-driven choices.

## Overlay scope questions

- An overlay can compose exact-subject and broader activity scopes. Which combinations it presents remains a product choice.
- The Grid already resolves slug search and capability filters into endpoint identities. Should an overlay follow that current set, or apply criteria to facts as they existed historically?
- A shared recent event pool can serve current Grid selections immediately while focused queries extend history. Keep the fetched scope and time coverage clear as those selections change.
- Event context follows the selected observation. An endpoint relationship change appears under its next model/provider; whether the former relationship's feed should also surface it remains open.

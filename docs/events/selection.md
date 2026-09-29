# Selection and the Grid overlay

- Endpoints own most directly comparable facts and expose model/provider relationships through the Grid.
- A model/provider pair can have several endpoints; discover offerings through the Grid or Catalog, then use their IDs.
- Model/provider events are rare enough that endpoint-only activity indexes currently offer little benefit.

## Planned overlay

- An entity-focused successor to Monitor can combine a shared recent event pool with focused historical queries.
- Proposed: populate that pool with bounded scan-sized reads, then reuse it across Grid selections.
- Show the fetched scope and time coverage as selection changes, so partial results remain understandable.
- The Grid already resolves slug search and capability filters into endpoint IDs.
- ❓ Should overlay membership follow those current IDs, or evaluate filters against facts at each historical time?

## Retrieval tradeoffs

- Longer, narrowly scoped history benefits from native pagination even when individual scans are small.
- Proposed: filter a bounded identity/time result for compound controls before adding more index combinations.

# Experimental feed

- Native paginated queries also support experiments and reactive clients.
- Feed uses the shared Monitor/Discord alert content, without batching; its output format remains experimental.

## HTTP requests

- `GET /events/feed` returns JSON in observation order, newest first.
- `limit` defaults to 20 and accepts 1–100 source events, before curation.
- Choose one scope: exact entity, model activity, or provider activity; omitting scope returns the complete feed.
- Exact entity selects its own changes; model/provider activity also includes related endpoint changes.

```text
GET /events/feed?limit=20
GET /events/feed?entity_kind=endpoint&entity_id=<endpoint_id>
GET /events/feed?entity_kind=model&entity_id=deepseek%2Fdeepseek-v4-flash-0731
GET /events/feed?entity_kind=provider&entity_id=inceptron
GET /events/feed?model_id=deepseek%2Fdeepseek-v4-flash-0731
GET /events/feed?provider_id=inceptron
GET /events/feed?limit=20&cursor=<opaque_cursor>
```

- Invalid parameters or cursors return HTTP 400; restart without a cursor when continuation becomes invalid.
- `next` is an absolute continuation URL or null; the HTTP `Link` header repeats continuation with `rel="next"`.

```json
{ "events": [], "next": "<absolute continuation URL>" }
```

## Pagination over growing history

- Follow `next` with its preserved filters and limit until null, including after an empty curated page.
- Native seek cursors preserve position as new head events arrive and distinguish events sharing an observation time.
- Restart at the head to read new activity.
- Late processing inserts events at their observation time; a completed traversal can precede older events arriving.
- The feed does not expose processor completion; polling from the head alone cannot guarantee discovery of late events.

See [Events](events.md) for historical identity and selection semantics.

# Experimental feed

Feed renders the shared alert content as individual JSON items with text descriptions. Its output format
is experimental; it has neither Discord batching nor Discord's pricing-frequency suppression.

## HTTP interface

`GET /events/feed` is served on the Convex HTTP origin. Results are newest first through completed
ingestion. `limit` counts source Events/observations before selection; defaults and bounds are in `config.md`.

| Parameters                    | Scope                                                            |
| ----------------------------- | ---------------------------------------------------------------- |
| None                          | All activity.                                                    |
| `entity_kind` and `entity_id` | One entity's own changes; both parameters are required together. |
| `model_id`                    | Model activity, including related endpoints.                     |
| `provider_id`                 | Provider activity, including related endpoints.                  |

Choose one scope. The response is `{ "events": [...], "next": <URL or null> }`.

- The `Link` header also supplies the continuation as `rel="next"`.
- Invalid parameters or cursors return HTTP 400; query failures return HTTP 500.
- Successful responses use `Cache-Control: no-store`.

## Continuation

- Follow `next` until null, including after empty selected pages; it preserves scope and limit.
- Cursors seek by observation order and distinguish rows sharing a scan time.
- New head rows do not shift the cursor position.
- Restart without a cursor to read new activity or recover an invalid continuation.

⚠️ A traversal can miss history inserted behind its cursor. Polling the head alone cannot
discover older inserted activity.

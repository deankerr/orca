# Availability

OpenRouter does not announce when an endpoint disappears. The current view keeps
the row and stamps `unlisted_at`.

## Endpoints

`unlisted_at` is optional `scan_at` on the endpoint view.

- Unset — listed in the latest complete ingested scan that considered this id.
- Set — start of **this** absence (the scan that first observed it gone).
- Cleared by the upsert that restores the row. Reappearance is the same
  `endpoint_id`.
- Later scans leave an already-unlisted row's stamp in place.
- ⚠️ `disabled` is an upstream field. The endpoint is still listed. Listing is
  `unlisted_at`.
- Empty model / empty provider is derived (zero listed endpoints). Not stored.
- The 30-day “hide rows gone longer than this” window is a consumer filter, not
  ingest policy.

Product copy (`→ unlisted`, **Gone**) can stay as tone. Existing catalog views
use `unavailable_at` for the same shape under a name that collides with
`disabled`.

## Models and providers

Not stamped. A vanishing catalog model is rare (usually a slug rename).
Providers are derived from endpoints: no listed endpoints is empty-provider.

## Signal

Adjacent complete artifacts: previous file has the id, this file does not.
Return is present in `after`, absent from `before`, against a retained view row.

- ⚠️ Incomplete `after` must not unlist. A stored scan artifact is complete.
- The view holds current listing only. After a return, the previous gap is gone
  from the row. Flip history belongs on a change event stream. Endpoints are
  notification-worthy; models and providers generally are not.

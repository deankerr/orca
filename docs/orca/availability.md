# Availability

ORCA does not delete entity records. OpenRouter does not announce when an endpoint
disappears. If you were routing through a particular endpoint’s capabilities or prices, you
may only notice after it is gone — and you may not have known which endpoint that was.
The current view keeps the row and stamps that it is no longer listed.

## Endpoints: `unlisted_at`

Optional timestamp on the endpoint view (`meps2_endpoints`). Unset means listed in the latest
complete catalog. Set is the start of **this** absence (the scan’s `started_at`). Cleared on
return by the upsert that restores the row.

Reappearance is the same `endpoint_id`. There is no final state. Later scans do not restamp an
already-unlisted row.

This is **not**:

| Term                         | Meaning                                                             |
| ---------------------------- | ------------------------------------------------------------------- |
| Hard delete                  | The row stays. Identity (`model_id`, `provider_tag`, …) stays.      |
| `disabled`                   | Still listed. OpenRouter says do not route. A different row status. |
| Empty model / empty provider | Derived: zero listed endpoints. Always computable. Not stored.      |

The product already has this word on the pricing chart (`→ unlisted`). Grid copy such as
**Gone** can stay — that is tone. `unavailable_at` in the existing catalog views is the same
shape under the wrong name: it collides with `disabled` and with empty-model.

The 30-day “hide rows gone longer than this” window is a consumer filter, not ingest policy.

## Models and providers

Not stamped. A model record vanishing from the catalog is rare (usually a slug rename) and can
be re-checked against the catalog API. Providers are derived from endpoints: “provider has no
listed endpoints” is the only upstream signal, and it is empty-provider, not a distinct delete.

## Signal

Adjacent complete catalogs: previous file has the id, this file does not. Return is “not in
before, in after” against a retained view row.

A succeeded meps2 scan is currently a complete catalog (one endpoint fetch failure fails the
whole scan, no artifact). Incomplete `after` must never unlist.

The view holds **current** listing state only. After a return, the previous gap is gone from
the row. History of those flips belongs on a later change stream (`entity_unlisted` /
`entity_listed`). Pricing and stats series do not get terminator rows yet — chart gaps are
deferred.

A raw change stream would also record these events. Endpoints are notification-worthy.
Models and providers generally are not.

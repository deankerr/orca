// * The shapes the engine reads out of OpenRouter's frontend API.
// *
// * Deliberately minimal: they name only the fields the crawl branches on. Stored documents keep
// * every field, named or not.
import * as Schema from 'effect/Schema'

// * One model as the catalog lists it. `permaslug` and `endpoint.variant` are the parameters an
// * endpoints query is built from.
export const CatalogModel = Schema.Struct({
  slug: Schema.String,
  permaslug: Schema.String,
  author: Schema.String,

  // * null for a model with nothing serving it — the catalog's only way of saying "zero endpoints",
  // * and the reason we never query those. `variant` is 'standard', 'free', 'thinking', …
  endpoint: Schema.NullOr(Schema.Struct({ variant: Schema.String })),
})
export type CatalogModel = Schema.Schema.Type<typeof CatalogModel>

export const CatalogResponse = Schema.Struct({
  data: Schema.Array(CatalogModel),
})

// * OpenRouter's whole response contract: `data` on success, `error` on failure.
// *
// * ⚠️ A gate, not a transform. `Schema.Struct` strips keys it does not name, so decoding through
// * this and storing the result would drop data. Callers validate against it and store the original
// * parse.
export const Envelope = Schema.Union([
  Schema.Struct({ data: Schema.Unknown }),
  Schema.Struct({ error: Schema.Unknown }),
])

// * One unit of work, encoded across the queue's process boundary: the producer and consumer are
// * separate Worker invocations that agree on nothing else.
export const EndpointsQuery = Schema.Struct({
  permaslug: Schema.String,
  variant: Schema.String,

  // * the crawl this belongs to, e.g. `2026-07-27T04-33-43Z`
  batch: Schema.String,
})
export type EndpointsQuery = Schema.Schema.Type<typeof EndpointsQuery>

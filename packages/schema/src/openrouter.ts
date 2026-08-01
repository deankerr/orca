// oxlint-disable sort-keys -- fields are grouped by what they are, not alphabetised

// * The shapes the engine reads out of OpenRouter's frontend API.
// *
// * Deliberately minimal: they name only the fields the crawl branches on. Stored documents keep
// * every field, named or not.
// *
// * ⚠️ Plain `Schema.String` throughout, deliberately. These are upstream's strings as upstream sent
// * them; the branded ids they turn into live in ./artifacts.ts, and the crawl parses one into the
// * other. A brand here would make a shape that describes what we wish upstream sent.
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

// oxlint-disable sort-keys

import * as Schema from 'effect/Schema'

const JsonRecord = Schema.Record(Schema.String, Schema.Json)
const Identity = Schema.NonEmptyString

/** Model identity for one routable variant. Other source fields remain unclassified JSON data. */
export const ModelVariant = Schema.StructWithRest(
  Schema.Struct({
    name: Identity,
    permaslug: Identity,
    short_name: Identity,
    slug: Identity,
    variant: Identity,
  }),
  [JsonRecord],
)
export type ModelVariant = typeof ModelVariant.Type

/** One provider endpoint. Other source fields remain unclassified JSON data. */
export const Endpoint = Schema.StructWithRest(
  Schema.Struct({
    id: Identity,
    model_variant_permaslug: Identity,
    model_variant_slug: Identity,
    variant: Identity,
  }),
  [JsonRecord],
)
export type Endpoint = typeof Endpoint.Type

/** One model variant paired with the endpoints that currently offer it. */
export const ModelEndpoints = Schema.Struct({
  model: ModelVariant,
  endpoints: Schema.Array(Endpoint),
})
export type ModelEndpoints = typeof ModelEndpoints.Type

/** One complete, usable observation of the OpenRouter model and endpoint inventory. */
export const Inventory = Schema.Struct({
  observedAt: Schema.String,
  modelEndpoints: Schema.Array(ModelEndpoints),
})
export type Inventory = typeof Inventory.Type

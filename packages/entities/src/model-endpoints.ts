// oxlint-disable sort-keys

// * Hoist denormalized OpenRouter endpoint rows into `{ model, endpoints }`.
// *
// * Observation `data` arrays carry the same embedded `model` on every row
// * (no variant on the model itself). This lifts one copy, heals variant into
// * slug / permaslug / name, and strips `model` from each endpoint row.
// *
// * Partial Effect Schema validation only — required identity fields; all other
// * keys pass through (`onExcessProperty: 'preserve'`). Not a single reversible
// * schema: decode, then structural hoist + heal + strip.
// *
// * Accepts either a decoded object array or a JSON string of that array
// * (`Schema.fromJsonString` for the string path — no manual `JSON.parse`).
// *
// * Usable on live capture payloads and historical archive endpoint arrays.
// * Return type is intentionally unenforced while the shape settles.

import * as Schema from 'effect/Schema'

const preserve = { onExcessProperty: 'preserve' as const }

// * Minimum model fields needed to hoist + heal. Everything else passes through.
const EmbeddedModel = Schema.Struct({
  slug: Schema.String,
  permaslug: Schema.String,
  name: Schema.String,
  short_name: Schema.String,
})

// * Minimum endpoint fields: variant lives here; model is denormalized per row.
const EndpointRow = Schema.Struct({
  variant: Schema.String,
  model_variant_slug: Schema.String,
  model_variant_permaslug: Schema.String,
  model: EmbeddedModel,
})

/** One model-scope observation must have at least one endpoint. */
const EndpointRows = Schema.NonEmptyArray(EndpointRow)
const decodeEndpointRows = Schema.decodeUnknownSync(EndpointRows, preserve)
const decodeEndpointRowsFromJson = Schema.decodeUnknownSync(
  Schema.fromJsonString(EndpointRows),
  preserve,
)

/** Append ` (variant)` when not `standard`. */
function withVariantName(name: string, variant: string): string {
  if (variant === 'standard') {
    return name
  }
  return `${name} (${variant})`
}

/**
 * Lift one model-scope endpoints array into `{ model, endpoints }`.
 *
 * - Decodes once as either a JSON string (`fromJsonString`) or an object array.
 * - Excess properties on each row and nested model are preserved.
 * - Hoists the first row's embedded model (any denormalized copy is fine).
 * - Heals `slug` / `permaslug` / `name` from the endpoint `variant`, and sets
 *   `model.variant` from the same.
 * - Strips the denormalized `model` key from every endpoint row.
 *
 * Expects a single model scope (shared variant + model identity), as returned
 * by OpenRouter `/stats/endpoint` for one permaslug+variant.
 *
 * @param data - Raw `data` array of endpoint rows, or a JSON string of that array
 *   (not the outer `{ data }` envelope)
 */
export const toModelEndpoints = (data: string | unknown[] | ReadonlyArray<unknown>) => {
  const rows =
    typeof data === 'string' ? decodeEndpointRowsFromJson(data) : decodeEndpointRows(data)

  // * First row is enough — denormalized model copies are identical within a scope.
  // * NonEmptyArray types the head as present.
  const [{ model: embedded, variant, model_variant_slug, model_variant_permaslug }] = rows

  const model = {
    ...embedded,
    slug: model_variant_slug,
    permaslug: model_variant_permaslug,
    name: withVariantName(embedded.name, variant),
    short_name: withVariantName(embedded.short_name, variant),
    variant,
  }

  // * Drop embedded model — it now lives once at the top level.
  const endpoints = rows.map(({ model: _model, ...endpoint }) => endpoint)

  return { model, endpoints }
}

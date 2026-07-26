// * One capture pass, read over the wire and reduced to the records an analysis wants: the raw
// * entities upstream actually returned, plus the pass's own summary. Nothing is mirrored and
// * nothing is canonicalized — this is the same dedupe `@orca/processes` does at the front of
// * canonicalization, done here so a script can point at any pass in the bucket without a mirror.
// *
// * Upstream embeds the same entities in each other repeatedly, so a scope's endpoints each carry
// * a copy of their model and provider. The copies are lifted out once per scope and the endpoint
// * records keep everything else verbatim — unknown keys included, because in a raw analysis an
// * unknown key is the finding.
import * as Schema from 'effect/Schema'

import { readText } from './artifacts.ts'
import type { Pass } from './artifacts.ts'

const Unknowns = Schema.Record(Schema.String, Schema.Unknown)

export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// * capture.json — the pass's own account of itself. Written last, which is what makes a pass
// * readable at all. Kept loose in the places where its shape is a tally whose keys are data
// * (statuses, cache states) and optional where older passes predate the field.
const Summary = Schema.Struct({
  captured_at: Schema.String,
  catalog: Schema.Struct({
    headers: Schema.Record(Schema.String, Schema.String),
    status: Schema.Number,
  }),
  chunks: Schema.Number,
  errors: Schema.Array(Schema.Unknown),
  freshness: Schema.optional(
    Schema.Struct({
      cache: Schema.Record(Schema.String, Schema.Number),
      maxAge: Schema.Number,
    }),
  ),
  models: Schema.Number,
  statuses: Schema.Record(Schema.String, Schema.Number),
  targets: Schema.Number,
})
export type Summary = Schema.Schema.Type<typeof Summary>
const decodeSummary = Schema.decodeUnknownSync(Summary)

// * an observation, typed only as far as the dedupe reaches. `body` stays unknown: a 404 body is
// * not the endpoint envelope, and a scope that answered without an endpoint list is a fact to
// * report, not a parse error.
const Observation = Schema.Struct({
  at: Schema.String,
  body: Schema.optional(Schema.Unknown),
  error: Schema.optional(Schema.String),
  permaslug: Schema.String,
  slug: Schema.String,
  status: Schema.optional(Schema.Number),
  variant: Schema.String,
})
const decodeObservation = Schema.decodeUnknownSync(Observation)

const Catalog = Schema.Struct({ data: Schema.Array(Unknowns) })
const decodeCatalog = Schema.decodeUnknownSync(Catalog)

export type PassRecords = {
  captured_at: string
  // * how many scopes were read, and how many of them carried an endpoint list
  scopes: { answered: number; errored: number; total: number; withEndpoints: number }
  summary: Summary
  // * raw records per entity, in the order upstream returned them. Deduping by natural key is
  // * the analysis's job — it is the analysis that knows what the key is.
  entities: {
    catalog: unknown[]
    endpoints: unknown[]
    models: unknown[]
    providers: unknown[]
  }
}

// * `catalog: false` skips models.json.gz — 5.8 MB per pass, and only worth fetching when the
// * catalog itself is being analysed
export const readPass = async (
  pass: Pass,
  options?: { catalog: boolean },
): Promise<PassRecords> => {
  const prefix = `raw/${pass.captured_at}/`
  const summary = decodeSummary(JSON.parse(await readText(`${prefix}capture.json`)))

  const catalogKey = `${prefix}models.json.gz`
  const catalog =
    options?.catalog !== false && pass.keys.includes(catalogKey)
      ? [...decodeCatalog(JSON.parse(await readText(catalogKey))).data]
      : []

  // * the eleven observation parts are independent objects — fetch them together
  const parts = await Promise.all(
    pass.keys
      .filter((key) => key.includes('/observations/'))
      .map(async (key) => await readText(key)),
  )

  const endpoints: unknown[] = []
  const models = new Map<string, unknown>()
  const providers = new Map<string, unknown>()
  const scopes = { answered: 0, errored: 0, total: 0, withEndpoints: 0 }

  for (const part of parts) {
    for (const line of part.trim().split('\n')) {
      const observation = decodeObservation(JSON.parse(line))
      scopes.total += 1
      if (observation.error === undefined) {
        scopes.answered += 1
      } else {
        scopes.errored += 1
      }

      // * only the endpoint envelope carries entities; anything else answered but told us nothing
      const { body } = observation
      const data = isPlainObject(body) && Array.isArray(body.data) ? body.data : undefined
      if (data === undefined) {
        continue
      }
      scopes.withEndpoints += 1

      for (const endpoint of data) {
        if (!isPlainObject(endpoint)) {
          continue
        }
        const { model, provider_info, ...rest } = endpoint
        endpoints.push(rest)
        // * the embedded copies differ in insignificant ways between endpoints of the same model,
        // * so first copy wins and the natural key decides identity
        if (isPlainObject(model) && typeof model.slug === 'string' && !models.has(model.slug)) {
          models.set(model.slug, model)
        }
        if (
          isPlainObject(provider_info) &&
          typeof provider_info.slug === 'string' &&
          !providers.has(provider_info.slug)
        ) {
          providers.set(provider_info.slug, provider_info)
        }
      }
    }
  }

  return {
    captured_at: pass.captured_at,
    entities: {
      catalog,
      endpoints,
      models: [...models.values()],
      providers: [...providers.values()],
    },
    scopes,
    summary,
  }
}

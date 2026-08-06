import type { CoreModel } from '@orca/schema/area-2-core.ts'
import * as Core from '@orca/schema/area-2-core.ts'
import * as Schema from 'effect/Schema'

const RawEndpoint = Schema.Struct({
  ...Core.CoreEndpoint.fields,
  model: Core.CoreModel, // enriched embedded Model
  stats: Schema.optional(Core.CoreEndpointStats),
})
type MaterializedEndpoint = Omit<Schema.Schema.Type<typeof RawEndpoint>, 'model'>

const BundlePayload = Schema.Struct({
  crawl_id: Schema.String,
  data: Schema.Struct({
    models: Schema.Array(
      Schema.Struct({
        endpoints: Schema.Array(RawEndpoint),
        model: Core.CoreModel,
      }),
    ),
  }),
})

const decode = Schema.decodeUnknownSync(Schema.fromJsonString(BundlePayload))

interface Scope {
  model: CoreModel
  endpoints: MaterializedEndpoint[]
}

export const materializeBundle = (raw: string) => {
  const result = decode(raw)

  const scopes: Scope[] = []

  for (const rawScope of result.data.models) {
    let { model } = rawScope
    const endpoints: MaterializedEndpoint[] = []

    for (const { model: embeddedModel, ...endpoint } of rawScope.endpoints) {
      // use enriched model for scope
      // last write wins (they are equivalent within a scope)
      model = embeddedModel
      endpoints.push(endpoint)
    }

    scopes.push({ endpoints, model })
  }

  return scopes
}

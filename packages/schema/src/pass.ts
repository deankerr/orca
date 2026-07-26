// oxlint-disable sort-keys -- the envelope is ordered by what it is: when, what was looked at,
// then the entities.

// * One canonical pass — the store's whole input, and the Layer 1 artifact contract stated as a
// * schema. Decoded at the edge so a malformed payload fails with a readable path instead of
// * halfway through an ingest loop.
// *
// * ⚠️ `catalog` and `observations` are the part of this contract that does not exist yet. A
// * canonical pass carrying entities alone cannot express what we looked at or what answered, so
// * an engine reading it can only choose between never closing anything and closing on bare
// * absence. Both of those are bugs; the evidence has to arrive with the entities.
import * as Schema from 'effect/Schema'

import { CATALOG } from './catalog.ts'
import {
  ENDPOINT_FEATURES,
  ENDPOINT_PRICING,
  ENDPOINT_SERIES,
  ENDPOINT_VERSIONS,
  Endpoint,
} from './endpoints.ts'
import type { Lane } from './lanes.ts'
import { MODEL_PARAMETERS, MODEL_SERIES, MODEL_VERSIONS, Model } from './models.ts'
import { OBSERVATIONS, Observation, PASSES } from './observations.ts'
import { PROVIDER_SERIES, PROVIDER_VERSIONS, Provider } from './providers.ts'

export const Pass = Schema.Struct({
  // * an ISO timestamp, sortable and readable — the only identity a pass has. Ingest is
  // * forward-only on it: a pass older than the newest ingested one is refused rather than
  // * interleaved, because backfill is a rebuild, not an insert.
  captured_at: Schema.String,
  // * variant slug → has at least one endpoint right now
  catalog: Schema.Record(Schema.String, Schema.Boolean),
  observations: Schema.Array(Observation),
  models: Schema.Array(Model),
  providers: Schema.Array(Provider),
  endpoints: Schema.Array(Endpoint),
})
export type Pass = Schema.Schema.Type<typeof Pass>

export const decodePass = Schema.decodeUnknownEffect(Pass)

// * Every table in the store, so ingest can verify each lane's projection against the real table
// * and a migration can never quietly drift from the schema.
export const LANES: readonly Lane[] = [
  CATALOG,
  MODEL_VERSIONS,
  MODEL_PARAMETERS,
  MODEL_SERIES,
  PROVIDER_VERSIONS,
  PROVIDER_SERIES,
  ENDPOINT_VERSIONS,
  ENDPOINT_PRICING,
  ENDPOINT_FEATURES,
  ENDPOINT_SERIES,
  OBSERVATIONS,
  PASSES,
]

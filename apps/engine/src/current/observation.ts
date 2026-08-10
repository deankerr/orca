// * ScopeObservation: one successful endpoints body → identity-validated raw endpoints.
// *
// * Strict enough for identity (string `id` present on each retained row). Loose on every product
// * field — those stay in the payload as OpenRouter sent them. No orca-legacy / product shaping,
// * no text-only filter, no change detection.
// *
// * See notes/data-architecture/current-view-slice.md (ScopeObservation, CurrentCache).
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'

/** One identity-validated endpoint row from an OpenRouter endpoints `data` array. */
export interface ObservedEndpoint {
  readonly id: string
  /** Full raw endpoint object (OpenRouter-shaped). */
  readonly payload: unknown
}

/** One successful endpoints result for a model-variant scope. */
export interface ScopeObservation {
  readonly endpoints: readonly ObservedEndpoint[]
}

/** Cache / queue unit: one model-variant observation. */
export type ScopeKey = string

export const encodeScopeKey = (permaslug: string, variant: string): ScopeKey =>
  `${permaslug}|${variant}`

// * Envelope only — rows are validated one at a time so a single bad element does not drop the scope.
const ObservationEnvelope = Schema.Struct({
  data: Schema.Array(Schema.Unknown),
})
const decodeEnvelope = Schema.decodeUnknownOption(ObservationEnvelope)

// * Identity only. Extra keys pass through because we keep the original object as payload.
const IdentityRow = Schema.Struct({
  id: Schema.String,
})
const decodeIdentity = Schema.decodeUnknownOption(IdentityRow)

const isUsableId = (id: string) => id.length > 0

/**
 * Parse one stored / live endpoints success body into a scope observation.
 *
 * `body` is the engine archive document: OpenRouter's JSON plus any extra keys (e.g. `headers`).
 * Returns `null` when the envelope is unusable or no row has a parseable id.
 */
export const parseEndpointsBody = (body: string): ScopeObservation | null => {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return null
  }

  const envelope = decodeEnvelope(parsed)
  if (Option.isNone(envelope)) {
    return null
  }

  const endpoints: ObservedEndpoint[] = []
  for (const item of envelope.value.data) {
    const identity = decodeIdentity(item)
    if (Option.isNone(identity) || !isUsableId(identity.value.id)) {
      continue
    }
    endpoints.push({ id: identity.value.id, payload: item })
  }

  if (endpoints.length === 0) {
    return null
  }

  return { endpoints }
}

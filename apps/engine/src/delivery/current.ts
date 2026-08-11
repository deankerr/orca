// * Product current-view delivery: observation body → Convex.
// * Always upserts on a usable observation.
// * Target URL + shared secret come from Worker init (effect/Config → bindings).
import { decodeEndpoint } from '@orca/entities/endpoint.ts'
import type { Endpoint } from '@orca/entities/endpoint.ts'
import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'
import * as Schema from 'effect/Schema'

// * ── project ────────────────────────────────────────────────────────────────────────────────

const Envelope = Schema.Struct({
  data: Schema.Array(Schema.Unknown),
})
const decodeEnvelope = Schema.decodeUnknownOption(Schema.fromJsonString(Envelope))

export type ProjectResult = {
  readonly endpoints: Endpoint[]
  /** OpenRouter data[] length when envelope decoded; 0 if envelope failed. */
  readonly dataLength: number
  /** Per-row product decode failures (index + message). Keep all — early days. */
  readonly rowErrors: ReadonlyArray<{ index: number; message: string }>
  readonly envelopeOk: boolean
}

/**
 * Map one endpoints success body to product cards.
 * Per-row failures are collected; partial delivery is ok.
 */
export const projectEndpoints = (body: string): ProjectResult => {
  const envelope = decodeEnvelope(body)
  if (Option.isNone(envelope)) {
    return { dataLength: 0, endpoints: [], envelopeOk: false, rowErrors: [] }
  }

  const endpoints: Endpoint[] = []
  const rowErrors: { index: number; message: string }[] = []
  for (const [index, row] of envelope.value.data.entries()) {
    try {
      endpoints.push(decodeEndpoint(row))
    } catch (error) {
      rowErrors.push({
        index,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return {
    dataLength: envelope.value.data.length,
    endpoints,
    envelopeOk: true,
    rowErrors,
  }
}

// * ── push ───────────────────────────────────────────────────────────────────────────────────

export type PushResult = {
  readonly insert: number
  readonly update: number
}

export type DeliveryTarget = {
  /** Convex HTTP site origin, e.g. https://….convex.site (no trailing path). */
  readonly siteUrl: string
  readonly apiKey: Redacted.Redacted
}

/** Typed delivery failure with whatever detail we have for Observability. */
export class DeliveryError extends Data.TaggedError('DeliveryError')<{
  readonly reason: 'request' | 'http' | 'response'
  readonly detail: string
  readonly status?: number
  readonly body?: string
}> {}

const decodePushResult = Schema.decodeUnknownEffect(
  Schema.fromJsonString(
    Schema.Struct({
      insert: Schema.Number,
      update: Schema.Number,
    }),
  ),
)

const endpointsUrl = (siteUrl: string) => `${siteUrl.replace(/\/$/, '')}/current/endpoints`

/** POST product cards to Convex. Caller must pass a non-empty list. */
export const pushEndpoints = (
  target: DeliveryTarget,
  endpoints: ReadonlyArray<Endpoint>,
): Effect.Effect<PushResult, DeliveryError> =>
  Effect.gen(function* pushEndpoints() {
    const response = yield* Effect.tryPromise({
      catch: (cause) => new DeliveryError({ detail: String(cause), reason: 'request' }),
      try: async () =>
        await fetch(endpointsUrl(target.siteUrl), {
          body: JSON.stringify({ endpoints }),
          headers: {
            authorization: `Bearer ${Redacted.value(target.apiKey)}`,
            'content-type': 'application/json',
          },
          method: 'POST',
        }),
    })

    const text = yield* Effect.tryPromise({
      catch: (cause) =>
        new DeliveryError({ detail: `body read: ${String(cause)}`, reason: 'request' }),
      try: async () => await response.text(),
    })

    if (!response.ok) {
      return yield* new DeliveryError({
        body: text,
        detail: `convex ${response.status}`,
        reason: 'http',
        status: response.status,
      })
    }

    return yield* decodePushResult(text).pipe(
      Effect.mapError(
        (error) =>
          new DeliveryError({
            body: text,
            detail: String(error),
            reason: 'response',
          }),
      ),
    )
  })

/** Project then push. Returns null when nothing projects. */
export const deliver =
  (target: DeliveryTarget) =>
  (body: string): Effect.Effect<PushResult | null, DeliveryError> =>
    Effect.gen(function* deliver() {
      const projected = projectEndpoints(body)

      if (!projected.envelopeOk) {
        yield* Effect.logWarning('delivery: body is not a data envelope').pipe(
          Effect.annotateLogs({ body, phase: 'delivery' }),
        )
        return null
      }

      if (projected.rowErrors.length > 0) {
        yield* Effect.logWarning('delivery: row product decode failures').pipe(
          Effect.annotateLogs({
            dataLength: String(projected.dataLength),
            ok: String(projected.endpoints.length),
            phase: 'delivery',
            rowErrors: JSON.stringify(projected.rowErrors),
          }),
        )
      }

      if (projected.endpoints.length === 0) {
        yield* Effect.logWarning('delivery: no projectable endpoints').pipe(
          Effect.annotateLogs({
            dataLength: String(projected.dataLength),
            phase: 'delivery',
            rowErrors: JSON.stringify(projected.rowErrors),
          }),
        )
        return null
      }

      const result = yield* pushEndpoints(target, projected.endpoints)
      yield* Effect.log('delivery: upserted').pipe(
        Effect.annotateLogs({
          insert: String(result.insert),
          phase: 'delivery',
          projected: String(projected.endpoints.length),
          update: String(result.update),
        }),
      )
      return result
    })

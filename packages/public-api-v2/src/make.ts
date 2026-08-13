// * Public API V2 composition: raw banked observations → D1 → GET response.
// *
// * Prep (hoist model, heal variant, strip nested model) is `@orca/entities`
// * `toModelEndpoints`. This file revalidates, maps via `transform`, upserts
// * whole models, and serves with relative stale filtering.

import { toModelEndpoints } from '@orca/entities/model-endpoints.ts'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'

import { decodeEndpointOption, decodeModelOption } from './schema.ts'
import type { ModelsResponse, Provider as V2Provider } from './schema.ts'
import * as Store from './store.ts'
import { toModel, toProvider } from './transform.ts'

// * ── deps / surface ─────────────────────────────────────────────────────────

/** One archived observation; body already loaded (engine Sink shape, package-local). */
export type ObservationItem = {
  readonly observedAt: string
  readonly scopeKey: string
  readonly body: string
}

export type PublicApiV2Deps = {
  readonly sql: Store.Sql
  /** Relative stale window vs overall watermark. Default 1h. */
  readonly staleMs?: number
}

export type PublicApiV2 = {
  readonly name: 'public-api-v2'
  readonly receive: (batch: ReadonlyArray<ObservationItem>) => Effect.Effect<void>
  readonly getModels: (args?: { limit?: number }) => Effect.Effect<ModelsResponse>
}

// * ── make ───────────────────────────────────────────────────────────────────

const Envelope = Schema.Struct({
  data: Schema.Array(Schema.Unknown),
})
const decodeEnvelope = Schema.decodeUnknownOption(Schema.fromJsonString(Envelope))

/** Prep may throw on empty/invalid rows; treat as soft-skip. */
function prepScope(
  data: ReadonlyArray<unknown>,
): Option.Option<ReturnType<typeof toModelEndpoints>> {
  try {
    return Option.some(toModelEndpoints(data))
  } catch {
    return Option.none()
  }
}

/**
 * Build the public-api-v2 sink + serve surface.
 * Engine injects D1 SQL; this package owns map, upsert, and assemble.
 */
export const make = (deps: PublicApiV2Deps): PublicApiV2 => {
  const store = Store.make(deps.sql, { staleMs: deps.staleMs })

  return {
    getModels: (args) => store.getModels(args),
    name: 'public-api-v2',
    receive: (batch) =>
      Effect.gen(function* receive() {
        let upserted = 0

        for (const item of batch) {
          const envelope = decodeEnvelope(item.body)
          if (Option.isNone(envelope)) {
            continue
          }

          const prepared = prepScope(envelope.value.data)
          if (Option.isNone(prepared)) {
            continue
          }

          const modelObs = decodeModelOption(prepared.value.model)
          if (Option.isNone(modelObs)) {
            continue
          }

          const providers: V2Provider[] = []
          for (const row of prepared.value.endpoints) {
            const endpoint = decodeEndpointOption(row)
            if (Option.isNone(endpoint) || endpoint.value.is_disabled) {
              continue
            }
            providers.push(toProvider(endpoint.value))
          }

          if (providers.length === 0) {
            continue
          }

          yield* store.upsert({
            model: toModel(modelObs.value, providers),
            updatedAt: item.observedAt,
          })
          upserted += 1
        }

        yield* Effect.log('public-api-v2: received batch').pipe(
          Effect.annotateLogs({
            observations: String(batch.length),
            phase: 'public-api-v2',
            upserted: String(upserted),
          }),
        )
      }).pipe(Effect.annotateLogs({ phase: 'public-api-v2', sink: 'public-api-v2' })),
  }
}

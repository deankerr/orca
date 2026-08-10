// * Worker-side CurrentCache over D1 + Effect SQL.
// *
// * Stores the latest ScopeObservation per scope key (identity-validated raw endpoints). Not a
// * product projection — product delivery and compare views land later. Always put on every
// * successful observation; never gated on "product changed."
// *
// * See notes/data-architecture/current-view-slice.md (CurrentCache).
// *
// * ⚠️ Published `@effect/sql-d1` does not yet expose D1 `batch`. Commits are sequential statements.
import type * as D1Client from '@effect/sql-d1/D1Client'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import type { SqlError } from 'effect/unstable/sql/SqlError'

import type { ScopeKey, ScopeObservation } from './observation.ts'

// * ── public shapes ─────────────────────────────────────────────────────────────────────────────

export interface CurrentStatus {
  /** Distinct scopes (model-variants) in the cache. */
  readonly models: number
  readonly endpoints: number
  /**
   * Endpoints treated as available. Until unavailability is wired, same as `endpoints`
   * (every cached endpoint is from a successful observation of its scope).
   */
  readonly available: number
}

export interface StoredScope {
  readonly key: ScopeKey
  readonly observation: ScopeObservation
  readonly observedBatch: string
  readonly updatedAt: string
}

export interface PutScope {
  readonly key: ScopeKey
  readonly observation: ScopeObservation
  readonly observedBatch: string
  readonly updatedAt: string
}

export type Current = ReturnType<typeof make>

// * Structural match for the Alchemy `SQL.D1` client (template-tag queries). Keeps tests free of
// * the full D1Client surface while production uses the real client.
export type Sql = <A extends object = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: ReadonlyArray<unknown>
) => Effect.Effect<ReadonlyArray<A>, SqlError>

// * ── codecs ────────────────────────────────────────────────────────────────────────────────────

const ObservedEndpoint = Schema.Struct({
  id: Schema.String,
  payload: Schema.Unknown,
})

const ScopeObservationSchema = Schema.Struct({
  endpoints: Schema.Array(ObservedEndpoint),
})

const decodeObservation = Schema.decodeUnknownSync(ScopeObservationSchema)
const encodeObservation = Schema.encodeSync(ScopeObservationSchema)

interface ScopeRow {
  readonly key: string
  readonly observation_json: string
  readonly endpoint_count: number
  readonly observed_batch: string
  readonly updated_at: string
}

interface CountRow {
  readonly n: number
}

const parseJson = (raw: string, label: string): unknown => {
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error(`stored ${label} is not valid JSON`)
  }
}

const observationFromRow = (row: ScopeRow): StoredScope => ({
  key: row.key,
  observation: decodeObservation(parseJson(row.observation_json, `scope ${row.key}`)),
  observedBatch: row.observed_batch,
  updatedAt: row.updated_at,
})

const observationJson = (observation: ScopeObservation) =>
  JSON.stringify(encodeObservation(observation))

// * SQL errors are defects at this boundary — same policy as the R2 archive.
const die = <A>(effect: Effect.Effect<A, SqlError>): Effect.Effect<A> => effect.pipe(Effect.orDie)

// * ── store ─────────────────────────────────────────────────────────────────────────────────────

export const make = (sql: Sql | D1Client.D1Client) => {
  const status = die(
    Effect.gen(function* status() {
      const [scopes] = yield* sql<CountRow>`SELECT COUNT(*) AS n FROM scopes`
      const [endpoints] = yield* sql<CountRow>`
        SELECT COALESCE(SUM(endpoint_count), 0) AS n FROM scopes
      `
      const n = endpoints?.n ?? 0
      return {
        available: n,
        endpoints: n,
        models: scopes?.n ?? 0,
      } satisfies CurrentStatus
    }),
  )

  const get = Effect.fn(function* get(key: ScopeKey) {
    const [row] = yield* die(
      sql<ScopeRow>`
        SELECT key, observation_json, endpoint_count, observed_batch, updated_at
        FROM scopes
        WHERE key = ${key}
      `,
    )
    return row === undefined ? null : observationFromRow(row)
  })

  /**
   * Always-write the latest observation for a scope. Replaces any prior observation for the key.
   * Not gated on product equality — that lives in planTransition / delivery later.
   */
  const put = Effect.fn(function* put(input: PutScope) {
    const json = observationJson(input.observation)
    const endpointCount = input.observation.endpoints.length
    yield* die(sql`
      INSERT INTO scopes (key, observation_json, endpoint_count, observed_batch, updated_at)
      VALUES (${input.key}, ${json}, ${endpointCount}, ${input.observedBatch}, ${input.updatedAt})
      ON CONFLICT (key) DO UPDATE SET
        observation_json = excluded.observation_json,
        endpoint_count = excluded.endpoint_count,
        observed_batch = excluded.observed_batch,
        updated_at = excluded.updated_at
    `)
  })

  return { get, put, status }
}

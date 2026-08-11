// * First/last seen clocks for scopes and endpoint ids after a successful observation.
import type * as D1Client from '@effect/sql-d1/D1Client'
import * as Effect from 'effect/Effect'
import type { SqlError } from 'effect/unstable/sql/SqlError'

export type EntityClocks = ReturnType<typeof make>

export type Sql = <A extends object = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: ReadonlyArray<unknown>
) => Effect.Effect<ReadonlyArray<A>, SqlError>

const die = <A>(effect: Effect.Effect<A, SqlError>): Effect.Effect<A> => effect.pipe(Effect.orDie)

export const make = (sql: Sql | D1Client.D1Client) => {
  const touchScope = Effect.fn(function* touchScope(key: string, at: string) {
    yield* die(sql`
      INSERT INTO scopes (key, first_detected_at, last_detected_at)
      VALUES (${key}, ${at}, ${at})
      ON CONFLICT (key) DO UPDATE SET last_detected_at = excluded.last_detected_at
    `)
  })

  const touchEndpoint = Effect.fn(function* touchEndpoint(args: {
    id: string
    scopeKey: string
    at: string
  }) {
    yield* die(sql`
      INSERT INTO endpoints (id, scope_key, first_detected_at, last_detected_at)
      VALUES (${args.id}, ${args.scopeKey}, ${args.at}, ${args.at})
      ON CONFLICT (id) DO UPDATE SET
        scope_key = excluded.scope_key,
        last_detected_at = excluded.last_detected_at
    `)
  })

  /** Record that this scope and these endpoint ids were successfully observed at `at`. */
  const record = Effect.fn(function* record(args: {
    scopeKey: string
    endpointIds: ReadonlyArray<string>
    at: string
  }) {
    yield* touchScope(args.scopeKey, args.at)
    for (const id of args.endpointIds) {
      yield* touchEndpoint({ at: args.at, id, scopeKey: args.scopeKey })
    }
  })

  const status = die(
    Effect.gen(function* status() {
      const [scopes] = yield* sql<{ n: number }>`SELECT COUNT(*) AS n FROM scopes`
      const [endpoints] = yield* sql<{ n: number }>`SELECT COUNT(*) AS n FROM endpoints`
      return {
        endpoints: endpoints?.n ?? 0,
        scopes: scopes?.n ?? 0,
      }
    }),
  )

  return { record, status }
}

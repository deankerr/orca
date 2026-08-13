// * D1 current-state for V2 models. Upsert on write; filter stale on read.
// * Watermark = max(updated_at). Staleness is relative to that, not wall clock.

import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import type { SqlError } from 'effect/unstable/sql/SqlError'

import { Model } from './schema.ts'
import type { Model as V2Model, ModelsResponse } from './schema.ts'

export type Sql = <A extends object = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: ReadonlyArray<unknown>
) => Effect.Effect<ReadonlyArray<A>, SqlError>

const encodeModelJson = Schema.encodeSync(Schema.fromJsonString(Model))
const decodeModelJson = Schema.decodeUnknownOption(Schema.fromJsonString(Model))

/** Default: models older than this relative to the overall watermark are omitted. */
export const DEFAULT_STALE_MS = 60 * 60 * 1000

/**
 * Capture `observedAt` path key (`2026-08-11T12-34-56Z`) → ISO-8601 for storage/API.
 * Passes through values that already parse as dates.
 */
export function observedAtToIso(observedAt: string): string {
  const dashed = /^(?<date>\d{4}-\d{2}-\d{2})T(?<h>\d{2})-(?<m>\d{2})-(?<s>\d{2})Z$/.exec(
    observedAt,
  )
  if (dashed?.groups !== undefined) {
    const { date, h, m, s } = dashed.groups
    return `${date}T${h}:${m}:${s}.000Z`
  }
  return Option.match(DateTime.make(observedAt), {
    onNone: () => observedAt,
    onSome: DateTime.formatIso,
  })
}

const die = <A>(effect: Effect.Effect<A, SqlError>): Effect.Effect<A> => effect.pipe(Effect.orDie)

export type ModelStore = {
  readonly upsert: (args: {
    model: V2Model
    /** Observation time (path key or ISO); stored as ISO. */
    updatedAt: string
  }) => Effect.Effect<void>
  readonly getModels: (args?: { limit?: number }) => Effect.Effect<ModelsResponse>
}

export const make = (sql: Sql, options?: { staleMs?: number }): ModelStore => {
  const staleMs = options?.staleMs ?? DEFAULT_STALE_MS
  const staleMillis = Math.max(0, Math.trunc(staleMs))

  const upsert = Effect.fn(function* upsert(args: { model: V2Model; updatedAt: string }) {
    const updatedAt = observedAtToIso(args.updatedAt)
    const body = encodeModelJson(args.model)
    yield* die(sql`
      INSERT INTO models (id, body, created_at, updated_at)
      VALUES (${args.model.id}, ${body}, ${args.model.created_at}, ${updatedAt})
      ON CONFLICT (id) DO UPDATE SET
        body = excluded.body,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
      WHERE excluded.updated_at >= models.updated_at
    `)
  })

  const getModels = Effect.fn(function* getModels(args?: { limit?: number }) {
    const [row] = yield* die(sql<{ overall: string | null }>`
      SELECT MAX(updated_at) AS overall FROM models
    `)
    const overall = row?.overall ?? null
    if (overall === null) {
      return {
        models: [] as V2Model[],
        updated_at: DateTime.formatIso(DateTime.makeUnsafe(0)),
      }
    }

    const overallDt = DateTime.make(overall)
    const cutoff = Option.match(overallDt, {
      onNone: () => DateTime.formatIso(DateTime.makeUnsafe(0)),
      onSome: (dt) => DateTime.formatIso(DateTime.subtract(dt, { milliseconds: staleMillis })),
    })

    const limit = args?.limit
    const rows =
      limit === undefined
        ? yield* die(sql<{ body: string }>`
            SELECT body FROM models
            WHERE updated_at >= ${cutoff}
            ORDER BY created_at DESC
          `)
        : yield* die(sql<{ body: string }>`
            SELECT body FROM models
            WHERE updated_at >= ${cutoff}
            ORDER BY created_at DESC
            LIMIT ${limit}
          `)

    const models: V2Model[] = []
    for (const { body } of rows) {
      const decoded = decodeModelJson(body)
      if (Option.isSome(decoded)) {
        models.push(decoded.value)
      }
    }

    return { models, updated_at: overall }
  })

  return { getModels, upsert }
}

import type * as D1Client from '@effect/sql-d1/D1Client'
import type * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as SQL from 'alchemy/SQL/D1'
import * as Context from 'effect/Context'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import type * as Statement from 'effect/unstable/sql/Statement'

import { ProjectionStoreError } from './ProjectionStoreError.ts'
import { Model } from './schema.ts'
import type { Model as V2Model, ModelsResponse } from './schema.ts'

const batchSize = 50
const encodeModelJson = Schema.encodeSync(Schema.fromJsonString(Model))
const decodeModelJson = Schema.decodeUnknownOption(Schema.fromJsonString(Model))

interface ProjectionReplacement {
  readonly etag: string
  readonly models: ReadonlyArray<V2Model>
  readonly observedAt: string
}

const mapSqlError = (operation: ProjectionStoreError['operation']) => (cause: unknown) =>
  new ProjectionStoreError({ cause, operation })

const chunksOf = <A>(values: ReadonlyArray<A>, size: number): ReadonlyArray<ReadonlyArray<A>> => {
  const chunks: Array<ReadonlyArray<A>> = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

/**
 * Stores complete V2 projections and exposes only the one selected by its source ETag.
 * @effect-expect-leaking RuntimeContext
 */
export class ProjectionStore extends Context.Service<
  ProjectionStore,
  {
    projectedEtag: Effect.Effect<string | undefined, ProjectionStoreError, Alchemy.RuntimeContext>
    getModels: (args?: {
      readonly limit?: number
    }) => Effect.Effect<ModelsResponse, ProjectionStoreError, Alchemy.RuntimeContext>
    replace: (
      replacement: ProjectionReplacement,
    ) => Effect.Effect<void, ProjectionStoreError, Alchemy.RuntimeContext>
  }
>()('@orca/public-api-v2/ProjectionStore') {
  static readonly layerNoDeps = Layer.effect(
    this,
    Effect.gen(function* layerNoDeps() {
      const resource = yield* Cloudflare.D1.Database('Projections', {
        migrationsDir: './migrations',
      })
      const database = yield* Cloudflare.D1.QueryDatabase(resource)
      const sql = yield* SQL.D1(database)

      return makeProjectionStore(sql)
    }),
  )

  static readonly layer = this.layerNoDeps.pipe(Layer.provide(Cloudflare.D1.QueryDatabaseBinding))
}

function makeProjectionStore(sql: D1Client.D1Client): ProjectionStore['Service'] {
  const projectedEtag = sql<{ source_etag: string }>`
    SELECT source_etag FROM projection_state WHERE id = 1
  `.pipe(
    Effect.map(([row]) => row?.source_etag),
    Effect.mapError(mapSqlError('read')),
  )

  const getModels = Effect.fn('ProjectionStore.getModels')(
    function* getModels(args?: { readonly limit?: number }) {
      const [projectionState] = yield* sql<{ source_etag: string; observed_at: string }>`
      SELECT source_etag, observed_at FROM projection_state WHERE id = 1
    `

      if (projectionState === undefined) {
        return {
          models: [] as V2Model[],
          updated_at: DateTime.formatIso(DateTime.makeUnsafe(0)),
        }
      }

      const modelRows = yield* args?.limit === undefined
        ? sql<{ body: string }>`
          SELECT body FROM models
          WHERE source_etag = ${projectionState.source_etag}
          ORDER BY created_at DESC
        `
        : sql<{ body: string }>`
          SELECT body FROM models
          WHERE source_etag = ${projectionState.source_etag}
          ORDER BY created_at DESC
          LIMIT ${args.limit}
        `

      const models: V2Model[] = []
      for (const { body } of modelRows) {
        const model = decodeModelJson(body)
        if (Option.isSome(model)) {
          models.push(model.value)
        }
      }

      return { models, updated_at: projectionState.observed_at }
    },
    Effect.mapError(mapSqlError('read')),
  )

  const replace = Effect.fn('ProjectionStore.replace')(function* replace({
    etag,
    models,
    observedAt,
  }: ProjectionReplacement) {
    yield* sql`DELETE FROM models WHERE source_etag = ${etag}`.pipe(
      Effect.mapError(mapSqlError('stage')),
    )

    const modelInserts: Array<Statement.Statement<Record<string, unknown>>> = models.map(
      (model) => sql`
        INSERT INTO models (source_etag, id, body, created_at)
        VALUES (${etag}, ${model.id}, ${encodeModelJson(model)}, ${model.created_at})
      `,
    )
    for (const batch of chunksOf(modelInserts, batchSize)) {
      yield* sql.batch(batch).pipe(Effect.mapError(mapSqlError('stage')))
    }

    yield* sql`
      INSERT INTO projection_state (id, source_etag, observed_at)
      VALUES (1, ${etag}, ${observedAt})
      ON CONFLICT (id) DO UPDATE SET
        source_etag = excluded.source_etag,
        observed_at = excluded.observed_at
    `.pipe(Effect.mapError(mapSqlError('activate')))

    yield* sql`DELETE FROM models WHERE source_etag <> ${etag}`.pipe(
      Effect.mapError(mapSqlError('cleanup')),
      Effect.catch((error) =>
        Effect.logWarning('public-api-v2: failed to clean inactive projections').pipe(
          Effect.annotateLogs({ cause: String(error.cause), phase: 'public-api-v2-refresh' }),
        ),
      ),
    )
  })

  return ProjectionStore.of({ getModels, projectedEtag, replace })
}

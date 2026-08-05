import { Database as BunDatabase } from 'bun:sqlite'

import { desc } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Semaphore from 'effect/Semaphore'

import { ProductDatabaseError } from './errors.ts'
import { queryRecentMonitorEvents } from './monitor.ts'
import type { MonitorEvent } from './monitor.ts'
import * as Schema from './schema.ts'

const createDatabase = (client: BunDatabase) => drizzle({ client })

type Database = ReturnType<typeof createDatabase>

/** A change ledger write without the crawl identifier supplied by the enclosing transaction. */
export type EndpointChange = Omit<typeof Schema.endpointChanges.$inferInsert, 'crawlId'>

/** A change ledger write without the crawl identifier supplied by the enclosing transaction. */
export type ModelChange = Omit<typeof Schema.modelChanges.$inferInsert, 'crawlId'>

/** The limited Area 3 transaction input; deriving changes remains Area 2's responsibility. */
export interface CrawlWrite {
  readonly crawl: {
    readonly crawlId: string
    readonly previousCrawlId?: string
    readonly processedAt: string
  }
  readonly endpointChanges: readonly EndpointChange[]
  readonly modelChanges: readonly ModelChange[]
}

/** The local SQLite database file opened by the Area 3 demonstration. */
export interface ProductDatabaseOptions {
  readonly filename: string
}

/**
 * An Effect-owned application boundary over Drizzle's synchronous `bun:sqlite` driver.
 *
 * Database operations are synchronous, so the service uses `Effect.try` rather than Promise
 * wrapping. The layer owns the connection, and one semaphore serializes local writer fibers.
 */
export class ProductDatabase extends Context.Service<
  ProductDatabase,
  {
    readonly appendCrawl: (input: CrawlWrite) => Effect.Effect<void, ProductDatabaseError>
    readonly latestCrawlId: Effect.Effect<string | undefined, ProductDatabaseError>
    readonly recentMonitorEvents: (
      limit: number,
    ) => Effect.Effect<readonly MonitorEvent[], ProductDatabaseError>
  }
>()('@orca/labs/area-3/ProductDatabase') {}

const appendCrawl = (database: Database, input: CrawlWrite) =>
  Effect.try({
    catch: (cause) => new ProductDatabaseError({ cause }),
    try: () => {
      database.transaction((transaction) => {
        transaction
          .insert(Schema.crawls)
          .values({
            crawlId: input.crawl.crawlId,
            previousCrawlId: input.crawl.previousCrawlId ?? null,
            processedAt: input.crawl.processedAt,
          })
          .run()

        if (input.modelChanges.length > 0) {
          transaction
            .insert(Schema.modelChanges)
            .values(
              input.modelChanges.map((change) => ({ ...change, crawlId: input.crawl.crawlId })),
            )
            .run()
        }
        if (input.endpointChanges.length > 0) {
          transaction
            .insert(Schema.endpointChanges)
            .values(
              input.endpointChanges.map((change) => ({ ...change, crawlId: input.crawl.crawlId })),
            )
            .run()
        }
      })
    },
  })

const latestCrawlId = (database: Database) =>
  Effect.try({
    catch: (cause) => new ProductDatabaseError({ cause }),
    try: () =>
      database
        .select({ crawlId: Schema.crawls.crawlId })
        .from(Schema.crawls)
        .orderBy(desc(Schema.crawls.crawlId))
        .limit(1)
        .get()?.crawlId,
  })

/**
 * Creates a scoped `bun:sqlite` layer. The actual schema must be migrated before this layer is
 * used; the initialization here only preserves Area 2's per-connection SQLite policy.
 */
export const layer = (options: ProductDatabaseOptions) =>
  Layer.effect(
    ProductDatabase,
    Effect.gen(function* createProductDatabaseLayer() {
      const client = yield* Effect.acquireRelease(
        Effect.try({
          catch: (cause) => new ProductDatabaseError({ cause }),
          try: () => new BunDatabase(options.filename, { create: true, readwrite: true }),
        }),
        (sqliteClient) =>
          Effect.sync(() => {
            sqliteClient.close()
          }).pipe(Effect.orDie),
      )
      yield* Effect.try({
        catch: (cause) => new ProductDatabaseError({ cause }),
        try: () => {
          client.run('PRAGMA foreign_keys = ON')
          client.run('PRAGMA journal_mode = WAL')
          client.run('PRAGMA synchronous = NORMAL')
        },
      })
      const database = yield* Effect.try({
        catch: (cause) => new ProductDatabaseError({ cause }),
        try: () => createDatabase(client),
      })
      const writers = yield* Semaphore.make(1)

      return ProductDatabase.of({
        appendCrawl: (input) => writers.withPermits(1)(appendCrawl(database, input)),
        latestCrawlId: latestCrawlId(database),
        recentMonitorEvents: (limit) => queryRecentMonitorEvents(database, limit),
      })
    }),
  )

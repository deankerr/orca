// * The pool protocol: what a consumer is allowed to read, and how its cursor moves.
// *
// * Producers append. Each consumer holds its own cursor over the pool and reads everything past it
// * at whatever cadence it likes — that is the entire coordination mechanism, and it is what gives
// * every actor an independent dial without negotiating with any other actor
// * (notes/data-architecture/artifact-pool.md §6).
// *
// * Everything below exists to make one sentence true: **a committed window has been delivered in
// * full.** Get that wrong and the pool loses rows silently, which is precisely the failure this
// * whole rework is replacing.
import type * as Cloudflare from 'alchemy/Cloudflare'
import * as Effect from 'effect/Effect'

import { literal, R2SqlError } from './r2-sql.ts'
import type { Query, Row } from './r2-sql.ts'

// * the Iceberg table the sink writes, as R2 SQL addresses it
const TABLE = 'pool.observations'

const EPOCH = '1970-01-01T00:00:00.000Z'

// * ⚠️ THE load-bearing constant.
// *
// * A consumer must never advance its cursor to the largest `__ingest_ts` it can currently see.
// * Rows become visible in batches when the sink rolls a file, so at any instant the newest part of
// * the pool is still arriving — and a row can land carrying an `__ingest_ts` older than one already
// * observed. A naive `WHERE __ingest_ts > cursor` would step over it and never look back.
// *
// * So every read is bounded on *both* sides, and the cursor advances only to a point far enough in
// * the past that nothing more can appear before it. 300s against a 60s roll interval is a 5×
// * margin.
// *
// * 📌 This puts a floor of ~5 minutes on end-to-end freshness. That is not a real cost here:
// * openrouter.md already establishes that sub-5-minute polling is wasted against OpenRouter's
// * cache, so the pool's floor sits below the dial's useful range. It *would* be a real cost for a
// * source that moved faster, and the fix would be a shorter roll interval, not a shorter settling.
export const SETTLING_SECONDS = 300

// * How wide a window a read covers. A consumer catching up from zero walks forward in these steps,
// * which is what makes "a new consumer starts at cursor zero and backfills for free" a bounded
// * operation rather than one enormous query.
export const DEFAULT_WINDOW_SECONDS = 3600
export const MAX_WINDOW_SECONDS = 86_400

// * A read returns every row in its window, so the window has to be narrow enough that they fit.
// * `limit` is what "fit" means, and the pool narrows the window until the rows are under it — see
// * `read` below. It is never used as a SQL LIMIT, because a truncated window cannot be committed.
export const DEFAULT_LIMIT = 500
export const MAX_LIMIT = 5000

// * how many times `read` may halve a window before giving up on making it fit
const MAX_BISECTIONS = 20

export type Pool = {
  db: Cloudflare.D1.QueryDatabaseClient
  query: Query
}

export type Consumer = {
  name: string
  cursor: string
  lag_budget_seconds: number
  updated_at: string
}

const iso = (millis: number) => new Date(millis).toISOString()

// * ── the registry ───────────────────────────────────────────────────────────────────────────

// * Register a consumer if it is new, and return its current position. A consumer that has never
// * been seen starts at the epoch, so its first read is the beginning of the pool.
export const enrol = Effect.fn(function* enrol(
  pool: Pool,
  args: { consumer: string; lagBudgetSeconds: number },
) {
  yield* pool.db
    .prepare(
      `INSERT INTO consumers (name, cursor, lag_budget_seconds, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET lag_budget_seconds = excluded.lag_budget_seconds`,
    )
    .bind(args.consumer, EPOCH, args.lagBudgetSeconds, iso(Date.now()))
    .run()

  return yield* get(pool, args.consumer)
})

export const get = Effect.fn(function* get(pool: Pool, consumer: string) {
  const row = yield* pool.db
    .prepare('SELECT name, cursor, lag_budget_seconds, updated_at FROM consumers WHERE name = ?')
    .bind(consumer)
    .first<Consumer>()
  return row
})

export const list = Effect.fn(function* list(pool: Pool) {
  const rows = yield* pool.db
    .prepare('SELECT name, cursor, lag_budget_seconds, updated_at FROM consumers ORDER BY name')
    .all<Consumer>()
  return rows.results
})

// * Advance a cursor. ⚠️ Monotonic by construction: `cursor < ?` in the WHERE clause means a
// * duplicate or out-of-order commit is a no-op rather than a rewind, so a consumer retrying a
// * commit it already made cannot walk itself backwards into reprocessing.
export const commit = Effect.fn(function* commit(
  pool: Pool,
  args: { consumer: string; through: string },
) {
  const result = yield* pool.db
    .prepare('UPDATE consumers SET cursor = ?, updated_at = ? WHERE name = ? AND cursor < ?')
    .bind(args.through, iso(Date.now()), args.consumer, args.through)
    .run()
  return { advanced: (result.meta.changes ?? 0) > 0 }
})

// * Reprocessing is a cursor reset (§6) — the whole story, no separate replay machinery.
export const reset = Effect.fn(function* reset(
  pool: Pool,
  args: { consumer: string; to?: string },
) {
  const to = args.to ?? EPOCH
  yield* pool.db
    .prepare('UPDATE consumers SET cursor = ?, updated_at = ? WHERE name = ?')
    .bind(to, iso(Date.now()), args.consumer)
    .run()
  return { cursor: to }
})

// * ── reading ────────────────────────────────────────────────────────────────────────────────

// * The newest `__ingest_ts` in the pool, or null when the pool is empty. This is the pool head that
// * every lag number is measured against.
export const head = Effect.fn(function* head(pool: Pool) {
  const rows = yield* pool.query(`SELECT MAX(__ingest_ts) AS head FROM ${TABLE}`)
  const value = rows[0]?.head
  return typeof value === 'string' ? value : null
})

const countIn = Effect.fn(function* countIn(
  pool: Pool,
  args: { from: string; to: string; kind?: string },
) {
  const filter = args.kind === undefined ? '' : ` AND kind = ${yield* literal(args.kind)}`
  const rows = yield* pool.query(
    `SELECT COUNT(*) AS n FROM ${TABLE}
     WHERE __ingest_ts > ${yield* literal(args.from)}
       AND __ingest_ts <= ${yield* literal(args.to)}${filter}`,
  )
  const value = rows[0]?.n
  return typeof value === 'number' ? value : Number(value ?? 0)
})

/**
 * Read the next window for a consumer.
 *
 * The window's upper bound is `now - SETTLING_SECONDS`, never the visible head, and it covers at
 * most `windowSeconds`. If the window holds more rows than `limit`, it is **halved until it fits**
 * rather than truncated with a SQL LIMIT — because a truncated window cannot be committed. Rows can
 * share an `__ingest_ts` to the millisecond, so there is no row-count boundary that is also a safe
 * cursor position; only a time boundary is. Narrowing keeps "a committed window was delivered in
 * full" true, at the cost of an extra COUNT per read.
 *
 * Returns `through: null` when there is nothing settled to read yet — the consumer commits nothing
 * and tries again later.
 */
export const read = Effect.fn(function* read(
  pool: Pool,
  args: {
    consumer: Consumer
    columns: readonly string[]
    kind?: string
    limit: number
    windowSeconds: number
  },
) {
  const from = args.consumer.cursor
  const ceiling = Date.now() - SETTLING_SECONDS * 1000
  const fromMillis = Date.parse(from)

  // * nothing has settled past this consumer's cursor yet
  if (Number.isNaN(fromMillis) || fromMillis >= ceiling) {
    return { bisections: 0, from, rows: [] as Row[], through: null }
  }

  // * start from the requested width, clipped to what has settled
  let windowMillis = args.windowSeconds * 1000
  let to = iso(Math.min(fromMillis + windowMillis, ceiling))
  let count = yield* countIn(pool, { from, kind: args.kind, to })
  let bisections = 0

  // * narrow until the window's rows fit under the limit
  while (count > args.limit) {
    if (bisections >= MAX_BISECTIONS) {
      return yield* Effect.fail(
        new R2SqlError(
          `window (${from}, ${to}] holds ${count} rows and will not narrow below limit ${args.limit} after ${bisections} bisections — raise the limit or investigate the density`,
        ),
      )
    }
    windowMillis = Math.max(1, Math.floor(windowMillis / 2))
    to = iso(Math.min(fromMillis + windowMillis, ceiling))
    count = yield* countIn(pool, { from, kind: args.kind, to })
    bisections += 1
  }

  const filter = args.kind === undefined ? '' : ` AND kind = ${yield* literal(args.kind)}`
  const rows = yield* pool.query(
    `SELECT ${args.columns.join(', ')} FROM ${TABLE}
     WHERE __ingest_ts > ${yield* literal(from)}
       AND __ingest_ts <= ${yield* literal(to)}${filter}
     ORDER BY __ingest_ts ASC`,
  )

  return { bisections, from, rows, through: to }
})

// * ── lag ────────────────────────────────────────────────────────────────────────────────────

/**
 * Watermark lag, as two independent quantities. Per §7 this is the guarantee that replaces the old
 * one-pipeline property, and it is why it ships with the pool rather than after it: independent
 * dials mean a consumer can stall silently while everything upstream looks healthy.
 *
 * - **ingest lag** — how long since anything landed in the pool at all. Catches a dead producer or
 *   a broken pipeline, neither of which any consumer's cursor would reveal.
 * - **consumer lag** — how far each consumer trails the head. Catches the silent stall.
 *
 * A consumer that is behind *and* advancing is working through a backlog; one that is behind and
 * whose `updated_at` is not moving is stalled. Both numbers are here so the difference is visible.
 */
export const lag = Effect.fn(function* lag(pool: Pool) {
  const at = Date.now()
  const poolHead = yield* head(pool)
  const headMillis = poolHead === null ? null : Date.parse(poolHead)

  const consumers = (yield* list(pool)).map((consumer) => {
    const cursorMillis = Date.parse(consumer.cursor)
    const behind = headMillis === null ? 0 : Math.max(0, (headMillis - cursorMillis) / 1000)
    return {
      cursor: consumer.cursor,
      lag_budget_seconds: consumer.lag_budget_seconds,
      lag_seconds: behind,
      name: consumer.name,
      stalled: behind > consumer.lag_budget_seconds,
      updated_at: consumer.updated_at,
    }
  })

  return {
    at: iso(at),
    consumers,
    head: poolHead,
    // * null when the pool is empty — which is not zero lag, it is no information
    ingest_lag_seconds: headMillis === null ? null : Math.max(0, (at - headMillis) / 1000),
    settling_seconds: SETTLING_SECONDS,
  }
})

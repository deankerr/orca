// * One writer, many readers. `POST /ingest` is the only write path; everything else is a read
// * over the rows ingest produced — including the change feed, which is a *view* over the same
// * versions the current-state route reads, not a second table with its own truth.
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Effect from 'effect/Effect'
import { HttpServerRequest } from 'effect/unstable/http/HttpServerRequest'
import * as HttpServerResponse from 'effect/unstable/http/HttpServerResponse'

import { ingest } from './ingest.ts'
import { decodePass } from './pass.ts'
import { Store } from './store.ts'

type Db = Cloudflare.D1.QueryDatabaseClient
type Row = Record<string, unknown>

const LIFECYCLE = new Set(['valid_from', 'valid_to', 'hash'])

const VERSIONED = [
  { entity: 'provider', keys: ['slug'], table: 'provider_versions' },
  { entity: 'model', keys: ['slug'], table: 'model_versions' },
  { entity: 'endpoint', keys: ['id'], table: 'endpoint_versions' },
  { entity: 'price', keys: ['endpoint_id', 'sku'], table: 'endpoint_pricing' },
] as const

// * The changeset the note calls a view: rows opened at this captured_at are births, rows closed
// * at it are deaths, and a key with both is an update whose changed fields fall straight out of
// * comparing the two versions. Monitor and Alerts read this; nothing re-diffs anything.
const changeset = Effect.fn(function* changes(db: Db, captured_at: string) {
  const feed: Record<string, unknown> = { captured_at }
  for (const { entity, keys, table } of VERSIONED) {
    const touched = yield* db
      .prepare(`SELECT * FROM ${table} WHERE valid_from = ? OR valid_to = ?`)
      .bind(captured_at, captured_at)
      .all<Row>()

    const byKey = new Map<string, { opened?: Row; closed?: Row }>()
    for (const row of touched.results) {
      const key = keys.map((column) => String(row[column])).join('/')
      const entry = byKey.get(key) ?? {}
      if (row.valid_from === captured_at) {
        entry.opened = row
      } else {
        entry.closed = row
      }
      byKey.set(key, entry)
    }

    const created: string[] = []
    const deleted: string[] = []
    const updated: { key: string; fields: Record<string, [unknown, unknown]> }[] = []
    for (const [key, { closed, opened }] of byKey) {
      if (closed === undefined) {
        created.push(key)
        continue
      }
      if (opened === undefined) {
        deleted.push(key)
        continue
      }
      const fields: Record<string, [unknown, unknown]> = {}
      for (const column of Object.keys(opened)) {
        if (!LIFECYCLE.has(column) && closed[column] !== opened[column]) {
          fields[column] = [closed[column], opened[column]]
        }
      }
      updated.push({ fields, key })
    }
    feed[entity] = { created, deleted, updated }
  }
  return feed
})

// * Current state, with staleness *derived* rather than stored: `valid_to IS NULL` says the value
// * is still true as far as we know, and the observation join says when we last confirmed it.
// * "current, confirmed 5 minutes ago" and "current, but nothing has looked in three days" are
// * different answers, and this is the query that can tell them apart.
const currentEndpoints = Effect.fn(function* current(db: Db, limit: number) {
  const latest = yield* db
    .prepare('SELECT MAX(captured_at) AS captured_at FROM passes')
    .first<{ captured_at: string | null }>()
  const rows = yield* db
    .prepare(
      `SELECT e.id, e.model_variant_slug, e.variant, e.provider_name, e.provider_slug,
              e.context_length, e.quantization, e.is_disabled, e.pricing_version_id, e.valid_from,
              (SELECT MAX(o.captured_at) FROM observations o
                WHERE o.permaslug = e.model_variant_permaslug AND o.variant = e.variant
                  AND o.error IS NULL AND o.status < 500) AS last_observed_at
         FROM endpoint_versions e
        WHERE e.valid_to IS NULL
        ORDER BY e.model_variant_slug, e.provider_slug
        LIMIT ?`,
    )
    .bind(limit)
    .all<Row & { last_observed_at: string | null }>()

  return {
    endpoints: rows.results.map((row) => ({
      ...row,
      stale: row.last_observed_at !== latest?.captured_at,
    })),
    latest_pass: latest?.captured_at ?? null,
  }
})

// * The figures the design note says must be measured rather than assumed: how many versions a
// * window of passes actually produced, against what storing every entity every pass would cost.
const stats = Effect.fn(function* summary(db: Db) {
  const passes = yield* db
    .prepare(
      'SELECT COUNT(*) AS count, MIN(captured_at) AS first, MAX(captured_at) AS last FROM passes',
    )
    .first<{ count: number; first: string | null; last: string | null }>()
  const observations = yield* db
    .prepare('SELECT COUNT(*) AS count FROM observations')
    .first<{ count: number }>()

  const tables: Record<string, { versions: number; open: number }> = {}
  let versions = 0
  let open = 0
  for (const { table } of VERSIONED) {
    const counts = yield* db
      .prepare(
        `SELECT COUNT(*) AS versions, SUM(CASE WHEN valid_to IS NULL THEN 1 ELSE 0 END) AS open FROM ${table}`,
      )
      .first<{ versions: number; open: number }>()
    tables[table] = { open: counts?.open ?? 0, versions: counts?.versions ?? 0 }
    versions += counts?.versions ?? 0
    open += counts?.open ?? 0
  }

  // * what one-row-per-entity-per-pass would have stored over the same window
  const naive = open * (passes?.count ?? 0)
  return {
    compression: {
      naive_rows: naive,
      ratio: versions === 0 ? null : Number((naive / versions).toFixed(1)),
      versions,
    },
    observations: observations?.count ?? 0,
    passes,
    tables,
  }
})

export default Cloudflare.Worker(
  'Worker',
  // * pinned port so the loader has a fixed target (1337 is alchemy's default, taken by capture)
  { dev: { port: 1338, strictPort: true }, main: import.meta.url },
  Effect.gen(function* init() {
    const db = yield* Cloudflare.D1.QueryDatabase(Store)

    return {
      fetch: Effect.gen(function* fetch() {
        const request = yield* HttpServerRequest
        // * HttpServerRequest.url is the path (plus query), not an absolute URL
        const [path = '/', query = ''] = request.url.split('?')
        const params = new URLSearchParams(query)
        const segments = path.split('/').filter((segment) => segment !== '')

        if (request.method === 'POST' && path === '/ingest') {
          const body = yield* request.json
          const pass = yield* decodePass(body)
          return yield* HttpServerResponse.json(yield* ingest(db, pass))
        }

        if (request.method === 'GET' && path === '/passes') {
          const rows = yield* db
            .prepare('SELECT * FROM passes ORDER BY captured_at DESC LIMIT ?')
            .bind(Number(params.get('limit') ?? '100'))
            .all<Row & { transitions: string }>()
          return yield* HttpServerResponse.json(
            rows.results.map((row) => ({
              ...row,
              transitions: JSON.parse(row.transitions) as unknown,
            })),
          )
        }

        if (request.method === 'GET' && segments[0] === 'changes' && segments[1] !== undefined) {
          return yield* HttpServerResponse.json(
            yield* changeset(db, decodeURIComponent(segments[1])),
          )
        }

        if (request.method === 'GET' && path === '/current/endpoints') {
          return yield* HttpServerResponse.json(
            yield* currentEndpoints(db, Number(params.get('limit') ?? '50')),
          )
        }

        // * one endpoint's full version history, and its price history straight out of the child
        // * table — the reverse replay the current pipeline needs for this, deleted
        if (request.method === 'GET' && segments[0] === 'endpoints' && segments[1] !== undefined) {
          const id = decodeURIComponent(segments[1])
          if (segments[2] === 'pricing') {
            const rows = yield* db
              .prepare(
                `SELECT sku, value, valid_from, valid_to FROM endpoint_pricing
                  WHERE endpoint_id = ? ORDER BY sku, valid_from`,
              )
              .bind(id)
              .all<Row>()
            return yield* HttpServerResponse.json(rows.results)
          }
          const rows = yield* db
            .prepare('SELECT * FROM endpoint_versions WHERE id = ? ORDER BY valid_from')
            .bind(id)
            .all<Row>()
          return yield* HttpServerResponse.json(rows.results)
        }

        if (request.method === 'GET' && path === '/stats') {
          return yield* HttpServerResponse.json(yield* stats(db))
        }

        return HttpServerResponse.text(
          [
            'orca normalized store (prototype)',
            '',
            'POST /ingest                     one canonicalized pass',
            'GET  /passes                     ingested passes, newest first',
            'GET  /changes/<captured_at>      changeset view for one pass',
            'GET  /current/endpoints          current rows + derived staleness',
            'GET  /endpoints/<id>             version history of one endpoint',
            'GET  /endpoints/<id>/pricing     price history, one row per SKU version',
            'GET  /stats                      row counts and measured compression',
          ].join('\n'),
        )
      }).pipe(
        // oxlint-disable-next-line promise/prefer-await-to-callbacks -- Effect error handlers are callback-shaped by design
        Effect.catchTag('SchemaError', (error) =>
          Effect.succeed(HttpServerResponse.text(error.message, { status: 400 })),
        ),
        // oxlint-disable-next-line promise/prefer-await-to-callbacks -- Effect error handlers are callback-shaped by design
        Effect.catchTag('PassOutOfOrder', (error) =>
          Effect.succeed(HttpServerResponse.text(error.message, { status: 409 })),
        ),
        // oxlint-disable-next-line promise/prefer-await-to-callbacks -- Effect error handlers are callback-shaped by design
        Effect.catchTag('HttpServerError', (error) =>
          Effect.succeed(HttpServerResponse.text(error.message, { status: 400 })),
        ),
        Effect.tapCause(Effect.logError),
      ),
    }
  }).pipe(Effect.provide(Cloudflare.D1.QueryDatabaseBinding)),
)

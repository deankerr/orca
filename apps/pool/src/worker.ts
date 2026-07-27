// * The pool's front door. It owns the protocol so that consumers stay trivial: read a window,
// * do the work, commit. Everything hard — the settling window, the narrowing, cursor monotonicity
// * — lives in ./cursor.ts and happens here so no consumer can get it wrong on its own.
// *
// * ⚠️ Note what this Worker never does: it does not look inside `payload`. `POST /append` decodes
// * the *envelope* and forwards the rest verbatim; `GET /read` hands back whatever R2 SQL returned.
// * A bug here is unrecoverable, so this layer does as close to nothing as possible.
import { ALL_COLUMNS, Append, ENVELOPE_COLUMNS } from '@orca/schema/pool.ts'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Effect from 'effect/Effect'
import * as Redacted from 'effect/Redacted'
import * as Schema from 'effect/Schema'
import { HttpServerRequest } from 'effect/unstable/http/HttpServerRequest'
import * as HttpServerResponse from 'effect/unstable/http/HttpServerResponse'

import * as Cursor from './cursor.ts'
import { query } from './r2-sql.ts'
import type { Substrate } from './substrate.ts'

// * Pipelines refuses an ingest request over 5 MB, so appends are chunked below it. 4 MB leaves
// * room for the JSON framing around the records. A single record over the limit can never be sent,
// * and silently dropping it would be a hole in Layer 0 — so it is refused loudly instead.
const MAX_APPEND_BYTES = 4 * 1024 * 1024

const decodeAppends = Schema.decodeUnknownEffect(Schema.Array(Append))
const encodeAppends = Schema.encodeUnknownEffect(Schema.Array(Append))

// * The two request bodies the pool does parse. Cursor moves are the one place a typo would be
// * expensive and silent — a bad `through` advances a consumer past data it never saw.
const CommitBody = Schema.Struct({
  consumer: Schema.NonEmptyString,
  through: Schema.NonEmptyString,
})
const decodeCommit = Schema.decodeUnknownEffect(CommitBody)

const ResetBody = Schema.Struct({
  consumer: Schema.NonEmptyString,
  to: Schema.optional(Schema.NonEmptyString),
})
const decodeReset = Schema.decodeUnknownEffect(ResetBody)

const json = (body: unknown, status = 200) => HttpServerResponse.json(body, { status })

const numberParam = (params: URLSearchParams, name: string, fallback: number, max: number) => {
  const raw = params.get(name)
  const value = raw === null ? fallback : Number(raw)
  return Number.isFinite(value) && value > 0 ? Math.min(value, max) : fallback
}

export default function PoolWorker(substrate: Substrate) {
  return Cloudflare.Worker(
    'Worker',
    { main: import.meta.url },
    Effect.gen(function* init() {
      const db = yield* Cloudflare.D1.QueryDatabase(substrate.cursors)
      const accountId = yield* substrate.catalog.accountId
      const bucket = yield* substrate.bucket.bucketName
      const endpoint = yield* substrate.stream.endpoint
      const readTokenValue = yield* substrate.readToken.value
      const sendTokenValue = yield* substrate.sendToken.value
      const accessKeyValue = yield* substrate.accessKey.text

      const pool = Effect.gen(function* makePool() {
        return {
          db,
          query: query({
            accountId: yield* accountId,
            bucket: yield* bucket,
            token: yield* readTokenValue,
          }),
        }
      })

      // * Send one batch of already-encoded envelopes to the stream's HTTP ingest endpoint.
      // * ⚠️ Pipelines accepts an event that fails schema validation and then *drops* it, so the
      // * decode in `appendRoute` is not decoration: it is the only thing between a malformed
      // * append and a record that silently never exists.
      const send = Effect.fn(function* send(batch: readonly unknown[]) {
        const url = yield* endpoint
        if (url === undefined) {
          return yield* Effect.die(new Error('stream has no HTTP ingest endpoint'))
        }
        const token = yield* sendTokenValue
        return yield* Effect.tryPromise(async () => {
          const response = await fetch(url, {
            body: JSON.stringify(batch),
            headers: {
              authorization: `Bearer ${Redacted.value(token)}`,
              'content-type': 'application/json',
            },
            method: 'POST',
          })
          if (!response.ok) {
            throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`)
          }
        })
      })

      const appendRoute = Effect.fn(function* appendRoute(body: unknown) {
        const records = yield* decodeAppends(Array.isArray(body) ? body : [body])
        const wire = yield* encodeAppends(records)

        // * chunk by encoded size, because record sizes vary by orders of magnitude — a fixed
        // * record count would be either wasteful or over the limit depending on the producer
        const batches: unknown[][] = []
        let batch: unknown[] = []
        let bytes = 0
        for (const record of wire) {
          const size = JSON.stringify(record).length
          if (size > MAX_APPEND_BYTES) {
            return yield* json(
              { error: `a record exceeds ${MAX_APPEND_BYTES} bytes and cannot be appended` },
              413,
            )
          }
          if (bytes + size > MAX_APPEND_BYTES && batch.length > 0) {
            batches.push(batch)
            batch = []
            bytes = 0
          }
          batch.push(record)
          bytes += size
        }
        if (batch.length > 0) {
          batches.push(batch)
        }

        for (const each of batches) {
          yield* send(each)
        }
        return yield* json({ appended: wire.length, batches: batches.length })
      })

      const readRoute = Effect.fn(function* readRoute(params: URLSearchParams) {
        const name = params.get('consumer')
        if (name === null) {
          return yield* json({ error: 'consumer is required' }, 400)
        }
        const consumer = yield* Cursor.enrol(yield* pool, {
          consumer: name,
          lagBudgetSeconds: numberParam(params, 'lag_budget_seconds', 3600, 86_400),
        })
        if (consumer === null) {
          return yield* json({ error: 'consumer could not be registered' }, 500)
        }

        const result = yield* Cursor.read(yield* pool, {
          // * envelope-only by default: `payload` dominates a row, and a consumer deciding
          // * *whether* it cares about a subject shouldn't pay to transport the body
          columns: params.get('payload') === 'true' ? ALL_COLUMNS : ENVELOPE_COLUMNS,
          consumer,
          kind: params.get('kind') ?? undefined,
          limit: numberParam(params, 'limit', Cursor.DEFAULT_LIMIT, Cursor.MAX_LIMIT),
          windowSeconds: numberParam(
            params,
            'window_seconds',
            Cursor.DEFAULT_WINDOW_SECONDS,
            Cursor.MAX_WINDOW_SECONDS,
          ),
        })
        return yield* json(result)
      })

      const healthRoute = Effect.fn(function* healthRoute() {
        const report = yield* Cursor.lag(yield* pool)
        // * non-200 when any consumer is past its budget, so this is usable as a probe and not
        // * only as a dashboard
        const stalled = report.consumers.some((consumer) => consumer.stalled)
        return yield* json(report, stalled ? 503 : 200)
      })

      // * ⚠️ Lag is the guarantee that replaces the old one-pipeline property (§7), so it is
      // * computed on the pool's own dial rather than only when someone asks. A stalled consumer
      // * that nobody happens to query is exactly the failure mode this exists to catch.
      // * `Effect.ignore`: a failed lag check must never take the Worker down with it.
      yield* Cloudflare.Workers.cron('*/5 * * * *', () =>
        Effect.gen(function* watch() {
          const report = yield* Cursor.lag(yield* pool)
          yield* Effect.log(`pool lag: ${JSON.stringify(report)}`)
          const stalled = report.consumers.filter((consumer) => consumer.stalled)
          if (stalled.length > 0) {
            yield* Effect.logError(
              `pool consumers stalled: ${stalled
                .map((consumer) => `${consumer.name} +${Math.round(consumer.lag_seconds)}s`)
                .join(', ')}`,
            )
          }
        }).pipe(Effect.tapCause(Effect.logError), Effect.ignore),
      )

      return {
        fetch: Effect.gen(function* fetch() {
          const request = yield* HttpServerRequest
          // * HttpServerRequest.url is the path with query, not an absolute URL — the base only
          // * exists to make it parseable
          const url = new URL(request.url, 'http://pool')
          const path = url.pathname
          const { method } = request

          if (path === '/') {
            return yield* json({ pool: 'orca', settling_seconds: Cursor.SETTLING_SECONDS })
          }

          // * every route below reads or writes the pool, so all of them are behind the key
          const expected = `Bearer ${Redacted.value(yield* accessKeyValue)}`
          if ((request.headers.authorization ?? '') !== expected) {
            return yield* json({ error: 'unauthorized' }, 401)
          }

          if (method === 'POST' && path === '/append') {
            return yield* appendRoute(yield* request.json)
          }

          if (method === 'GET' && path === '/read') {
            return yield* readRoute(url.searchParams)
          }

          if (method === 'POST' && path === '/commit') {
            const body = yield* decodeCommit(yield* request.json)
            const result = yield* Cursor.commit(yield* pool, body)
            return yield* json({ ...result, consumer: body.consumer, cursor: body.through })
          }

          // * reprocessing is a cursor reset (§6) — no separate replay machinery
          if (method === 'POST' && path === '/reset') {
            const body = yield* decodeReset(yield* request.json)
            const result = yield* Cursor.reset(yield* pool, body)
            return yield* json({ consumer: body.consumer, ...result })
          }

          if (method === 'GET' && path === '/health') {
            return yield* healthRoute()
          }

          return yield* json({ error: 'not found' }, 404)
        }).pipe(
          // oxlint-disable-next-line promise/prefer-await-to-callbacks -- Effect error handlers are callback-shaped by design
          Effect.catchCause((cause) =>
            Effect.logError(cause).pipe(
              Effect.andThen(json({ detail: String(cause), error: 'pool error' }, 500)),
            ),
          ),
        ),
      }
    }).pipe(
      Effect.provide(Cloudflare.Workers.CronEventSourceLive),
      Effect.provide(Cloudflare.D1.QueryDatabaseBinding),
    ),
  )
}

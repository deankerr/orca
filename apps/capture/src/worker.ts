import * as Cloudflare from 'alchemy/Cloudflare'
import * as Effect from 'effect/Effect'
import { HttpServerRequest } from 'effect/unstable/http/HttpServerRequest'
import * as HttpServerResponse from 'effect/unstable/http/HttpServerResponse'

import { Artifacts } from './artifacts.ts'
import CaptureWorkflow from './capture-workflow.ts'

// * a pass is identified by when it was captured — sortable, human-readable, no mixed concepts
const newCapturedAt = () => new Date().toISOString()

const gunzipText = (bytes: ArrayBuffer) =>
  Effect.tryPromise(async () => {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
    return await new Response(stream).text()
  }).pipe(Effect.orDie)

export default Cloudflare.Worker(
  'Worker',
  { main: import.meta.url },
  Effect.gen(function* init() {
    const capture = yield* CaptureWorkflow
    const bucket = yield* Cloudflare.R2.ReadWriteBucket(Artifacts)

    yield* Cloudflare.Workers.cron('*/15 * * * *', () =>
      Effect.gen(function* startCapture() {
        const instance = yield* capture.create({ params: { captured_at: newCapturedAt() } })
        yield* Effect.log(`capture started: ${instance.id}`)
      }),
    )

    return {
      fetch: Effect.gen(function* fetch() {
        const request = yield* HttpServerRequest
        // * HttpServerRequest.url is already the path (with query), not an absolute URL — the
        // * base below is a placeholder that only exists to make it parseable
        const url = new URL(request.url, 'http://capture')
        const path = url.pathname

        // * manual trigger
        if (request.method === 'POST' && path === '/capture') {
          const captured_at = newCapturedAt()
          const instance = yield* capture.create({ params: { captured_at } })
          return yield* HttpServerResponse.json({ captured_at, instanceId: instance.id })
        }

        // * workflow instance status
        if (request.method === 'GET' && path.startsWith('/capture/')) {
          const instanceId = path.split('/').pop() ?? ''
          const instance = yield* capture.get(instanceId)
          const status = yield* instance.status()
          return yield* HttpServerResponse.json(status)
        }

        // * every key under raw/, so a reader can discover passes without credentials.
        // * `?startAfter=<key>` continues from a key already seen — passes are immutable and
        // * their keys sort chronologically, so that is all an incremental reader needs.
        // * This is a listing, not an interpretation: the Worker still says nothing about what
        // * a pass means. See scripts/artifacts.ts, which is the only consumer.
        if (request.method === 'GET' && path === '/raw') {
          const startAfter = url.searchParams.get('startAfter')
          const keys: string[] = []
          let cursor: string | undefined
          do {
            const page = yield* bucket.list({
              cursor,
              limit: 1000,
              prefix: 'raw/',
              // * R2 ignores startAfter once a cursor is in play; keep it to the first page
              startAfter: cursor === undefined ? (startAfter ?? undefined) : undefined,
            })
            for (const object of page.objects) {
              keys.push(object.key)
            }
            cursor = page.truncated ? page.cursor : undefined
          } while (cursor !== undefined)
          return yield* HttpServerResponse.json(keys)
        }

        // * fetch one raw artifact verbatim (/raw/<captured_at>/<file>), gunzipping .gz
        // * server-side for eyeballing. Layer 0 serves only bytes it wrote — it interprets
        // * nothing; canonicalization and everything above it reads these artifacts.
        if (request.method === 'GET' && path.startsWith('/raw/')) {
          const key = path.slice(1)
          const object = yield* bucket.get(key)
          if (object === null) {
            return HttpServerResponse.text('not found', { status: 404 })
          }
          if (!key.endsWith('.gz')) {
            return HttpServerResponse.text(yield* object.text())
          }
          return HttpServerResponse.text(yield* gunzipText(yield* object.arrayBuffer()))
        }

        return HttpServerResponse.text('orca capture')
      }).pipe(
        // oxlint-disable-next-line promise/prefer-await-to-callbacks -- Effect error handlers are callback-shaped by design
        Effect.catchTag('R2Error', (error) =>
          Effect.succeed(HttpServerResponse.text(error.message, { status: 500 })),
        ),
      ),
    }
  }).pipe(
    Effect.provide(Cloudflare.Workers.CronEventSourceLive),
    Effect.provide(Cloudflare.R2.ReadWriteBucketBinding),
  ),
)

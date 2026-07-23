import * as Cloudflare from 'alchemy/Cloudflare'
import * as Effect from 'effect/Effect'
import { HttpServerRequest } from 'effect/unstable/http/HttpServerRequest'
import * as HttpServerResponse from 'effect/unstable/http/HttpServerResponse'

import { Artifacts } from './artifacts.ts'
import CaptureWorkflow from './capture-workflow.ts'

// * a pass is identified by when it was captured — sortable, human-readable, no mixed concepts
const newCapturedAt = () => new Date().toISOString()

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
        // * HttpServerRequest.url is already the path, not an absolute URL
        const path = request.url

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

        // * list a pass's artifacts (/raw/<captured_at>) or fetch one (/raw/<captured_at>/<file>),
        // * gunzipping .gz server-side — verification/debug affordance only
        if (request.method === 'GET' && path.startsWith('/raw/')) {
          const key = path.slice(1)
          if (key.split('/').length > 2) {
            const object = yield* bucket.get(key)
            if (object === null) {
              return HttpServerResponse.text('not found', { status: 404 })
            }
            if (!key.endsWith('.gz')) {
              return HttpServerResponse.text(yield* object.text())
            }
            const bytes = yield* object.arrayBuffer()
            const text = yield* Effect.tryPromise(async () => {
              const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
              return await new Response(stream).text()
            }).pipe(Effect.orDie)
            return HttpServerResponse.text(text)
          }
          const listing = yield* bucket.list({ prefix: `${key}/` })
          const objects = listing.objects.map((o) => ({ key: o.key, size: o.size }))
          return yield* HttpServerResponse.json({ objects })
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

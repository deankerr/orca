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

// * loose shapes — deliberately unvalidated, typed only as far as the dedupe touches them
type RawEndpoint = Record<string, unknown> & {
  model: Record<string, unknown>
  provider_info: Record<string, unknown> & { slug: string }
}
type Observation = Record<string, unknown> & {
  slug: string
  variant: string
  status: number
  body?: { data?: RawEndpoint[] }
}

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

    // * deduped view of a whole pass. Upstream embeds the same entities in each other
    // * repeatedly with careless hygiene (copies differ in insignificant ways); nothing
    // * downstream should ever see those duplicates.
    // * - models: catalog reduced to variant slug -> "has at least one endpoint right now"
    // * - providers: provider_info deduped globally across the observation set
    // * - scopes: one entry per observation, model recovered once from its embedded
    // *   copies, endpoints kept clustered with their scope, stripped of embedded copies
    const passView = (captured_at: string) =>
      Effect.gen(function* buildPassView() {
        const catalogObject = yield* bucket.get(`raw/${captured_at}/models.json.gz`)
        if (catalogObject === null) {
          return HttpServerResponse.text('not found', { status: 404 })
        }
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- raw artifact, typed only as far as the reduction touches it
        const catalog = JSON.parse(yield* gunzipText(yield* catalogObject.arrayBuffer())) as {
          data: Array<{ slug: string; endpoint: { model_variant_slug: string } | null }>
        }
        // * keyed by the endpoint's variant slug when one exists (preserves e.g.
        // * "x/y:free" vs "x/y"); bare catalog slug otherwise
        const models: Record<string, boolean> = {}
        for (const m of catalog.data) {
          models[m.endpoint?.model_variant_slug ?? m.slug] = m.endpoint !== null
        }

        const providers = new Map<string, Record<string, unknown>>()
        const scopes: Array<Record<string, unknown>> = []
        const listing = yield* bucket.list({ prefix: `raw/${captured_at}/observations/` })
        for (const part of listing.objects) {
          const object = yield* bucket.get(part.key)
          if (object === null) {
            continue
          }
          const lines = (yield* gunzipText(yield* object.arrayBuffer())).trim().split('\n')
          for (const line of lines) {
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- raw artifact, typed only as far as the dedupe touches it
            const { body, ...scope } = JSON.parse(line) as Observation
            let model: Record<string, unknown> | null = null
            const endpoints = (body?.data ?? []).map((endpoint) => {
              const { model: embeddedModel, provider_info, ...rest } = endpoint
              model ??= embeddedModel
              providers.set(provider_info.slug, provider_info)
              return rest
            })
            scopes.push({ ...scope, endpoints, model })
          }
        }

        return yield* HttpServerResponse.json({
          captured_at,
          models,
          providers: [...providers.values()],
          scopes,
        })
      })

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

        // * fetch one raw artifact verbatim (/raw/<captured_at>/<file>), gunzipping .gz
        // * server-side — escape hatch only; the deduped pass view below is the real interface
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
            return HttpServerResponse.text(yield* gunzipText(yield* object.arrayBuffer()))
          }

          // * whole-pass deduped view (/raw/<captured_at>)
          return yield* passView(key.split('/')[1] ?? '')
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

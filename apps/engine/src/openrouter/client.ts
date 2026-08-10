// * The only place that knows OpenRouter exists.
import { CatalogResponse, Envelope } from '@orca/schema/openrouter.ts'
import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'
import * as Schedule from 'effect/Schedule'
import * as Schema from 'effect/Schema'

const BASE_URL = 'https://openrouter.ai'

const decodeCatalog = Schema.decodeUnknownEffect(CatalogResponse)
const decodeEnvelope = Schema.decodeUnknownEffect(Envelope)

// * `Schema.Record` preserves every key, which is what lets a parsed document be spread without
// * losing anything. A named struct would strip whatever it does not mention.
const decodeObject = Schema.decodeUnknownEffect(Schema.Record(Schema.String, Schema.Unknown))

const parseJson = (body: string) =>
  Effect.try((): unknown => JSON.parse(body)).pipe(Effect.flatMap(decodeObject))

// * A 429 or 5xx is a fact about the moment — load, a rate limit, a bad minute upstream — so asking
// * again is likely to produce a different answer. Every other status is settled: it describes what
// * we asked for.
const isTransient = (status: number) => status === 429 || status >= 500

// * Exists so `Effect.retry` has a typed failure to match on; never escapes this module.
class Transient extends Data.TaggedError('Transient')<{ response: Response }> {}

// * Three retries over ~7s: long enough to ride out a rate limit, short enough for a Worker's
// * budget with four in flight.
const backoff = Schedule.exponential('1 second')

// * Dropped from every capture. `set-cookie` is a Cloudflare bot-management cookie that changes on
// * every response, so keeping it would make header diffs between batches always differ.
const DROPPED_HEADERS = new Set(['set-cookie'])

// * One settled exchange, internal to this module. What leaves it is an observation: a status and the
// * document to store at it.
type Response = {
  status: number

  // * `date`, `age` and `cf-cache-status` are what tell a reader whether an observation is fresh or
  // * cached, which is otherwise unknowable from behind a cache. Filtered by `DROPPED_HEADERS`.
  headers: Record<string, string>

  body: string
}

// * Returns the settled response. A transport failure fails the effect instead, leaving redelivery
// * to the queue.
const get = Effect.fn(function* get(path: string, params?: Record<string, string>) {
  const url = new URL(path, BASE_URL)
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value)
  }

  const once = Effect.gen(function* once() {
    const response = yield* Effect.tryPromise(async (): Promise<Response> => {
      const sent = await fetch(url, { headers: { accept: 'application/json' } })
      return {
        body: await sent.text(),
        headers: Object.fromEntries(
          [...sent.headers].filter(([name]) => !DROPPED_HEADERS.has(name)),
        ),
        status: sent.status,
      }
    })

    return isTransient(response.status) ? yield* new Transient({ response }) : response
  })

  // * `while` keeps the retry to transient statuses; a transport failure shares this channel and
  // * passes straight through. When the retries run out we settle for the last response.
  return yield* once.pipe(
    Effect.retry({ schedule: backoff, times: 3, while: (error) => error instanceof Transient }),
    Effect.catchTag('Transient', (error) => Effect.succeed(error.response)),
  )
})

// * What gets stored: OpenRouter's document with `headers` added.
// *
// * ⚠️ `Envelope` is a gate. The value spread here is the original parse, so a key OpenRouter adds
// * tomorrow survives; storing the decoded value would drop it.
const document = Effect.fn(function* document(response: Response) {
  const parsed = yield* parseJson(response.body)
  yield* decodeEnvelope(parsed)
  return JSON.stringify({ ...parsed, headers: response.headers })
})

// * The crawl's starting point. `models` is the work list; `body` is stored as the batch root.
// *
// * ⚠️ A catalog that does not come back is not an artifact — it is an observation of us, not of
// * OpenRouter, and belongs in an alert. Transient statuses have already been retried; anything
// * still non-200 kills the crawl and stores nothing.
export const catalog = Effect.fn(function* catalog() {
  const response = yield* get('/api/frontend/v1/catalog/models')
  if (response.status !== 200) {
    return yield* Effect.die(new Error(`catalog returned ${response.status}: ${response.body}`))
  }

  // * `decodeCatalog` is a stronger gate than `Envelope`, so this parses once here rather than
  // * handing four megabytes to `document` to parse again.
  const parsed = yield* parseJson(response.body).pipe(Effect.orDie)
  const { data } = yield* decodeCatalog(parsed)

  return {
    body: JSON.stringify({ ...parsed, headers: response.headers }),
    models: data,
  }
})

// * One observation of one model's endpoints: the status it settled on, and the document to store at
// * that status. Both, in one call, because storing one without the other is never right.
// *
// * ⚠️ Every settled status comes back, errors included. The endpoints API cannot say "zero
// * endpoints" — a model losing its last one answers 404 — and since we only ask about models the
// * catalog said were available, a 404 means the two surfaces disagreed.
export const endpoints = Effect.fn(function* endpoints(args: {
  permaslug: string
  variant: string
}) {
  const response = yield* get('/api/frontend/v1/stats/endpoint', {
    permaslug: args.permaslug,
    variant: args.variant,
  })

  return { body: yield* document(response).pipe(Effect.orDie), status: response.status }
})

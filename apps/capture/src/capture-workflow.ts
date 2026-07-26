import * as Cloudflare from 'alchemy/Cloudflare'
import * as Effect from 'effect/Effect'

import { Artifacts } from './artifacts.ts'

const OPENROUTER = 'https://openrouter.ai'

// * each chunk runs as its own durable task, with its own subrequest budget and retry
// * scope — a mid-crawl failure only refetches one chunk, and successes are durable immediately
const CHUNK_SIZE = 40
const CONCURRENCY = 8

// * Layer 0 capture: fetch the OpenRouter catalog and per-model endpoint stats,
// * store what we receive verbatim in R2. No interpretation — a bug here is unrecoverable,
// * so this layer does as close to nothing as possible.

// * minimal shape needed to enumerate endpoint requests — everything else passes through untouched
type ModelRecord = { slug: string; permaslug: string; endpoint?: { variant?: string } | null }

// * ⚠️ Response headers are part of the observation, not metadata about it, and they cannot be
// * backfilled — a pass captured without them is permanently missing the answer to three
// * questions:
// *   - how stale was this? OpenRouter's API sits behind Cloudflare's cache, so `age` and `date`
// *     are the difference between "observed at T" and "observed something generated at T minus
// *     several minutes". Every timing claim downstream rests on it.
// *   - is "unchanged" real? Without cache indicators, being handed the same cached object twice is
// *     indistinguishable from the world not changing.
// *   - can polling be cheap? `etag` / `last-modified` are what make conditional requests possible,
// *     which is the only way to decouple how often we look from what it costs.
// * `set-cookie` is dropped deliberately — it is credential material, never observation, and it is
// * the one header we would not want in an immutable artifact. Everything else is kept verbatim.
const headersOf = (response: Response) => {
  const headers: Record<string, string> = {}
  for (const [name, value] of response.headers) {
    if (name.toLowerCase() !== 'set-cookie') {
      headers[name] = value
    }
  }
  return headers
}

const fetchJson = (url: string) =>
  Effect.tryPromise(async () => {
    const res = await fetch(url, { headers: { accept: 'application/json' } })
    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText} for ${url}`)
    }
    return { body: await res.json(), headers: headersOf(res), status: res.status }
  })

// * every HTTP response is an observation — a 404 is data (e.g. "this model has zero endpoints"),
// * not a failure. Only transport errors (after light retry) are recorded as errors, and an error
// * never advances knowledge of a scope — it just leaves it stale until the next pass.
const observe = (url: string) =>
  Effect.tryPromise(async () => {
    const res = await fetch(url, { headers: { accept: 'application/json' } })
    const text = await res.text()
    let body: unknown = text
    try {
      body = JSON.parse(text)
    } catch {
      // * non-JSON body recorded verbatim as text
    }
    // oxlint-disable-next-line sort-keys -- body last: it dominates the stored line, and status and headers are what you want to see first when eyeballing one
    return { status: res.status, headers: headersOf(res), body }
  }).pipe(Effect.retry({ times: 2 }))

// * gzip via the web-standard CompressionStream available in the workers runtime
const gzip = (text: string) =>
  Effect.tryPromise(async () => {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
    return await new Response(stream).arrayBuffer()
  })

// * surface the failure cause in logs before the task dies — orDie alone swallows it
const logged = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.tapCause(Effect.logError), Effect.orDie)

export default class CaptureWorkflow extends Cloudflare.Workflow<CaptureWorkflow>()(
  'Capture',
  Effect.gen(function* init() {
    const bucket = yield* Cloudflare.R2.ReadWriteBucket(Artifacts)

    return Effect.fn(function* capture(input: { captured_at: string }) {
      const { captured_at } = input
      const prefix = `raw/${captured_at}`

      // * one durable step: the catalog response, stored verbatim. Task return values are
      // * checkpointed with a ~1MiB cap, so return only the request targets, never the records.
      const catalog = yield* Cloudflare.Workflows.task(
        'fetch-models',
        logged(
          Effect.gen(function* models() {
            const response = yield* fetchJson(`${OPENROUTER}/api/frontend/v1/catalog/models`)
            // * the stored object stays the verbatim body — its response metadata travels in the
            // * pass summary instead, so consumers reading `models.json.gz` are unaffected
            const bytes = yield* gzip(JSON.stringify(response.body))
            yield* bucket.put(`${prefix}/models.json.gz`, bytes)
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- layer 0 deliberately doesn't validate; typed only as far as we access
            const records = (response.body as { data: ModelRecord[] }).data
            const targets = records
              .filter(
                (m) => m.endpoint !== null && m.endpoint !== undefined && !m.slug.startsWith('~'),
              )
              .map((m) => ({ permaslug: m.permaslug, slug: m.slug, variant: m.endpoint?.variant }))
            return {
              headers: response.headers,
              models: records.length,
              status: response.status,
              targets,
            }
          }),
        ),
        {
          retries: { backoff: 'exponential', delay: '10 seconds', limit: 3 },
          timeout: '2 minutes',
        },
      )

      const { targets } = catalog
      const chunks: (typeof targets)[] = []
      for (let i = 0; i < targets.length; i += CHUNK_SIZE) {
        chunks.push(targets.slice(i, i + CHUNK_SIZE))
      }

      // * one durable step per chunk: one self-describing observation per JSONL line — scope,
      // * its own timestamp, and what happened (any HTTP status + verbatim body, or a transport
      // * error). The pass is a scheduling artifact; each line stands alone.
      const statuses: Record<string, number> = {}
      const errors: { permaslug: string; variant?: string; error: string }[] = []
      for (const [index, chunk] of chunks.entries()) {
        const part = index.toString().padStart(3, '0')
        const result = yield* Cloudflare.Workflows.task(
          `observe-endpoints-${part}`,
          logged(
            Effect.gen(function* endpoints() {
              // oxlint-disable-next-line unicorn/no-array-for-each -- Effect.forEach is Effect's concurrency combinator, not Array#forEach
              const observations = yield* Effect.forEach(
                chunk,
                (m) => {
                  // oxlint-disable-next-line sort-keys -- slug first: insertion order is the stored line's key order
                  const scope = { slug: m.slug, permaslug: m.permaslug, variant: m.variant }
                  const query = new URLSearchParams({
                    permaslug: m.permaslug,
                    variant: m.variant ?? 'standard',
                  })
                  return observe(
                    `${OPENROUTER}/api/frontend/v1/stats/endpoint?${query.toString()}`,
                  ).pipe(
                    Effect.map((res) => ({ ...scope, at: new Date().toISOString(), ...res })),
                    Effect.catch((error) =>
                      Effect.succeed({
                        ...scope,
                        at: new Date().toISOString(),
                        error: String(error),
                      }),
                    ),
                  )
                },
                { concurrency: CONCURRENCY },
              )

              const jsonl = observations.map((o) => JSON.stringify(o)).join('\n')
              const bytes = yield* gzip(jsonl)
              yield* bucket.put(`${prefix}/observations/${part}.jsonl.gz`, bytes)

              // * step return values are checkpointed; keep them small (tallies, not bodies)
              const tally: Record<string, number> = {}
              const chunkErrors: typeof errors = []
              for (const o of observations) {
                if ('error' in o) {
                  chunkErrors.push({ error: o.error, permaslug: o.permaslug, variant: o.variant })
                } else {
                  tally[o.status] = (tally[o.status] ?? 0) + 1
                }
              }
              return { errors: chunkErrors, tally }
            }),
          ),
          {
            retries: { backoff: 'exponential', delay: '15 seconds', limit: 3 },
            timeout: '3 minutes',
          },
        )
        errors.push(...result.errors)
        for (const [status, count] of Object.entries(result.tally)) {
          statuses[status] = (statuses[status] ?? 0) + count
        }
      }

      // * one durable step: the pass summary — presence marks the pass as finished. Errors are
      // * scopes whose knowledge didn't advance this pass, not holes to explain later.
      const summary = {
        captured_at,
        // * the catalogue's own response metadata: it is one request, it is where a new model first
        // * appears, and whether it was served from cache decides what its timestamp means
        catalog: { headers: catalog.headers, status: catalog.status },
        chunks: chunks.length,
        errors,
        models: catalog.models,
        statuses,
        targets: targets.length,
      }
      // * asVoid: task returns are checkpointed via structured clone, and R2's put result
      // * (R2Object) carries a non-serializable Checksums — never checkpoint it
      yield* Cloudflare.Workflows.task(
        'write-summary',
        logged(
          bucket
            .put(`${prefix}/capture.json`, JSON.stringify(summary, null, 2))
            .pipe(Effect.asVoid),
        ),
        { retries: { backoff: 'exponential', delay: '5 seconds', limit: 3 }, timeout: '1 minute' },
      )

      return {
        captured_at,
        chunks: chunks.length,
        errors: errors.length,
        statuses,
        targets: targets.length,
      }
    })
  }).pipe(Effect.provide(Cloudflare.R2.ReadWriteBucketBinding)),
) {}

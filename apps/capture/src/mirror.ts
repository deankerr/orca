// * Local mirror of Layer 0 artifacts. Lists the capture bucket and copies whole passes to
// * packages/processes/input/raw/, where Layer 1 reads them. Lives here (not in
// * @orca/processes) because reading R2 with the local Alchemy profile needs the alchemy
// * dependency; the mirror only moves bytes, so nothing interprets them on this side.
// * Run: bun run mirror [--passes N | --all] [--stage dev_dean] [--refresh]
import { parseArgs } from 'node:util'

import * as BunServices from '@effect/platform-bun/BunServices'
import { AuthProviders } from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import type { Credentials } from 'alchemy/cloudflare/Credentials'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Logger from 'effect/Logger'
import * as FetchHttpClient from 'effect/unstable/http/FetchHttpClient'
import type * as HttpClient from 'effect/unstable/http/HttpClient'
import prettyBytes from 'pretty-bytes'
import { z } from 'zod'

const { values } = parseArgs({
  options: {
    all: { default: false, type: 'boolean' },
    passes: { default: '2', type: 'string' },
    refresh: { default: false, type: 'boolean' },
    stage: { type: 'string' },
  },
})

const stage = values.stage ?? `dev_${process.env.USER}`
const mirrorDir = new URL('../../../packages/processes/input/raw/', import.meta.url).pathname
const cachePath = new URL('../.mirror-cache.json', import.meta.url).pathname

// * bucket identity comes from the stack's own state — no hardcoded ids, no env file. Reading it
// * spawns the alchemy CLI (~3s), so it's cached per stage; --refresh re-reads after a recreate.
const Identity = z.object({ accountId: z.string(), bucketName: z.string() })
const Cache = z.record(z.string(), Identity)
const StackState = z.looseObject({ attr: Identity })

const bucketIdentity = Effect.gen(function* identity() {
  const cache = yield* Effect.promise(async () =>
    (await Bun.file(cachePath).exists())
      ? Cache.parse(await Bun.file(cachePath).json())
      : Cache.parse({}),
  )

  const cached = cache[stage]
  if (cached !== undefined && !values.refresh) {
    yield* Effect.log(`bucket ${cached.bucketName} (cached)`)
    return cached
  }

  yield* Effect.log(`reading stack state for stage ${stage}`)
  const state = yield* Effect.promise(
    async (): Promise<unknown> =>
      await Bun.$`bunx alchemy state get --stack OrcaCapture --stage ${stage} --fqn Artifacts`
        .quiet()
        .json(),
  )
  const { attr } = StackState.parse(state)
  yield* Effect.promise(
    async () => await Bun.write(cachePath, JSON.stringify({ ...cache, [stage]: attr }, null, 2)),
  )
  yield* Effect.log(`bucket ${attr.bucketName}`)
  return attr
}).pipe(Effect.withLogSpan('identity'))

const program = Effect.gen(function* mirror() {
  const { accountId, bucketName } = yield* bucketIdentity

  // * the *Http/*Local R2 binding layers expect to be built inside a stack; standalone we hand
  // * the same client the ambient credentials context directly
  const context = yield* Effect.context<Credentials | HttpClient.HttpClient>()
  const bucket = Cloudflare.R2.makeReadR2HttpClient(
    {
      accountId: Effect.succeed(accountId),
      authorize: (effect) => effect.pipe(Effect.provideContext(context)),
    },
    Effect.succeed(bucketName),
    Effect.succeed('default'),
  )

  // * one flat listing of raw/ — a delimiter is accepted but this client drops
  // * delimitedPrefixes, so passes are recovered from the keys themselves
  const keysByPass = new Map<string, string[]>()
  yield* Effect.gen(function* list() {
    let cursor: string | undefined
    let objects = 0
    let pages = 0
    do {
      yield* Effect.log(`listing raw/ (page ${pages + 1})`)
      const page = yield* bucket.list({ cursor, limit: 1000, prefix: 'raw/' })
      for (const object of page.objects) {
        const pass = object.key.split('/')[1] ?? ''
        keysByPass.set(pass, [...(keysByPass.get(pass) ?? []), object.key])
      }
      objects += page.objects.length
      pages += 1
      cursor = page.truncated ? page.cursor : undefined
    } while (cursor !== undefined)
    yield* Effect.log(
      `listed ${objects} objects in ${pages} pages across ${keysByPass.size} passes`,
    )
  }).pipe(Effect.withLogSpan('list'))

  const all = [...keysByPass.keys()].toSorted()
  const selected = values.all ? all : all.slice(-Number(values.passes))
  yield* Effect.log(`mirroring ${selected.length} of ${all.length} passes`)

  // * skip what's already on disk — passes are immutable, so presence is sufficient
  let downloaded = 0
  for (const [index, pass] of selected.entries()) {
    const keys = keysByPass.get(pass) ?? []
    let copied = 0
    let bytes = 0
    yield* Effect.gen(function* copyPass() {
      for (const key of keys) {
        const path = mirrorDir + key.slice('raw/'.length)
        const exists = yield* Effect.promise(async () => await Bun.file(path).exists())
        if (exists) {
          continue
        }
        const object = yield* bucket.get(key)
        if (object === null) {
          yield* Effect.logWarning(`${key} vanished between list and get — skipped`)
          continue
        }
        const body = yield* object.arrayBuffer()
        yield* Effect.promise(async () => await Bun.write(path, body))
        copied += 1
        bytes += body.byteLength
        yield* Effect.log(`${key.slice(`raw/${pass}/`.length)} ${prettyBytes(body.byteLength)}`)
      }
      yield* Effect.log(
        `${pass} [${index + 1}/${selected.length}] ${copied}/${keys.length} objects, ${prettyBytes(bytes)}`,
      )
    }).pipe(Effect.withLogSpan('pass'))
    downloaded += bytes
  }

  yield* Effect.log(`done: ${selected.length} passes, ${prettyBytes(downloaded)} downloaded`)
}).pipe(Effect.withLogSpan('mirror'))

// * the R2 client's auth contract declares RuntimeContext for in-stack callers; nothing on the
// * read path uses it, so the standalone program runs with the credentials layer alone
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- discharging a requirement nothing on this path reads
await (program as Effect.Effect<void, unknown>).pipe(
  Effect.provide(
    Layer.mergeAll(
      Cloudflare.CloudflareApiLive(),
      FetchHttpClient.layer,
      Logger.layer([Logger.consolePretty()]),
    ).pipe(Layer.provideMerge(Layer.mergeAll(BunServices.layer, Layer.succeed(AuthProviders, {})))),
  ),
  Effect.runPromise,
)

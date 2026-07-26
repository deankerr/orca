// * Reading Layer 0 artifacts, for the scripts in this directory. It lists keys and hands back
// * what they contain — nothing here interprets a pass, and nothing is mirrored: a script asks for
// * the keys it wants, when it wants them.
// *
// * Reads go through the capture Worker's own `/raw` routes rather than the bucket, because that
// * is the only door the stack can open by itself. R2's S3 API would need credentials, and minting
// * them is out of reach: alchemy's Cloudflare OAuth profile has no api_tokens scope (Cloudflare's
// * OAuth client offers none), so a token would have to be made by hand in the dashboard and
// * remembered afterwards — which is exactly what the stack is supposed to spare us. The Worker
// * already served `/raw/<key>` publicly; discovery is one more listing route on it.
// *
// * Two things are cached in `.artifacts-cache.json` (gitignored) because both are stable and slow
// * to ask for: the Worker's URL (reading stack state spawns the alchemy CLI, ~3s) and the key
// * listing (passes are immutable and their keys sort chronologically, so each run lists only what
// * was written after the newest complete pass).
import * as Schema from 'effect/Schema'

const stage = process.env.ALCHEMY_STAGE ?? `dev_${process.env.USER}`
const cachePath = new URL('../.artifacts-cache.json', import.meta.url).pathname
const appDir = new URL('..', import.meta.url).pathname

// * `keys` holds everything at or below `startAfter`, which is the last key of the newest pass
// * known to be complete. Keys above it are deliberately not cached — they may belong to a pass
// * still being written, whose remaining keys can sort before the ones already there.
const Cache = Schema.Struct({
  keys: Schema.Array(Schema.String),
  stage: Schema.String,
  startAfter: Schema.String,
  url: Schema.String,
})
const decodeCache = Schema.decodeUnknownSync(Cache)

// * `alchemy state get` prints a resource's stored attributes
const WorkerState = Schema.Struct({ attr: Schema.Struct({ url: Schema.String }) })
const decodeWorkerState = Schema.decodeUnknownSync(WorkerState)

const readCache = async () => {
  const file = Bun.file(cachePath)
  const cache = (await file.exists()) ? decodeCache(await file.json()) : undefined
  // * another stage is another bucket, and shares no keys with this one
  return cache?.stage === stage ? cache : undefined
}

const resolveUrl = async () => {
  console.log(`reading stack state for stage ${stage}`)
  const output =
    await Bun.$`bunx alchemy state get --stack OrcaCapture --stage ${stage} --fqn Worker`
      .cwd(appDir)
      .quiet()
      .text()
  try {
    return decodeWorkerState(JSON.parse(output)).attr.url.replace(/\/+$/, '')
  } catch {
    throw new Error(`no Worker url in stage ${stage}: ${output.trim()} — deploy first`)
  }
}

// * CAPTURE_URL points the scripts somewhere else — `alchemy dev` on localhost, another stage
let resolved: Promise<string> | undefined
const captureUrl = async () =>
  await (resolved ??= (async () => {
    const cache = await readCache()
    return process.env.CAPTURE_URL ?? cache?.url ?? (await resolveUrl())
  })())

const get = async (path: string) => {
  const response = await fetch(`${await captureUrl()}${path}`)
  if (!response.ok) {
    throw new Error(`GET ${path} → ${response.status} ${await response.text()}`)
  }
  return response
}

const Keys = Schema.Array(Schema.String)
const decodeKeys = Schema.decodeUnknownSync(Keys)

export type Pass = { captured_at: string; keys: string[] }

// * every readable pass, oldest first. A pass is readable once its capture.json is there — it is
// * written last, so its presence is what says the rest of the pass arrived.
export const passes = async (): Promise<Pass[]> => {
  const cache = await readCache()
  const listed = await get(
    cache === undefined ? '/raw' : `/raw?startAfter=${encodeURIComponent(cache.startAfter)}`,
  )
  const keys = [...(cache?.keys ?? []), ...decodeKeys(await listed.json())]

  const keysByPass = new Map<string, string[]>()
  for (const key of keys) {
    const [, captured_at] = key.split('/')
    if (captured_at !== undefined) {
      keysByPass.set(captured_at, [...(keysByPass.get(captured_at) ?? []), key])
    }
  }

  const complete = [...keysByPass]
    .filter(([captured_at, passKeys]) => passKeys.includes(`raw/${captured_at}/capture.json`))
    .map(([captured_at, passKeys]) => ({ captured_at, keys: passKeys.toSorted() }))
    .toSorted((a, b) => a.captured_at.localeCompare(b.captured_at))

  const startAfter = complete.at(-1)?.keys.at(-1)
  if (startAfter !== undefined) {
    const url = await captureUrl()
    await Bun.write(
      cachePath,
      JSON.stringify({ keys: keys.filter((key) => key <= startAfter), stage, startAfter, url }),
    )
  }

  return complete
}

// * Which passes a script was asked for, spelled the same way by every script in here: the
// * argument names where to *end* — a captured_at or any prefix of one, newest match wins, the
// * latest pass when there is no argument — and `last` how many passes back from there to take.
export const select = (all: Pass[], options: { last?: string; pass?: string }): Pass[] => {
  if (all.length === 0) {
    throw new Error('no complete passes in the bucket')
  }
  const last = options.last === undefined ? 1 : Number(options.last)
  if (!Number.isInteger(last) || last < 1) {
    throw new Error(`--last ${options.last} is not a positive whole number`)
  }
  const end =
    options.pass === undefined
      ? all.length - 1
      : all.findLastIndex((pass) => pass.captured_at.startsWith(options.pass ?? ''))
  if (end < 0) {
    throw new Error(`no pass matches ${options.pass} — try --list`)
  }
  return all.slice(Math.max(0, end + 1 - last), end + 1)
}

// * one artifact's contents. The Worker gunzips `.gz` on the way out, so this is text either way.
export const readText = async (key: string) => {
  const response = await get(`/${key}`)
  return await response.text()
}

// * drop the cache — for after a redeploy that moved the Worker, or a bucket that was recreated
export const forget = async () => {
  await Bun.file(cachePath).delete()
  resolved = undefined
}

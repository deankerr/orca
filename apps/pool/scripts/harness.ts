// * The pool's whole test surface, and deliberately data-agnostic: it appends records whose payload
// * means nothing, then proves the protocol delivered every one of them exactly once.
// *
// * It also measures the two things the design *assumes* rather than knows:
// *   - how long append → readable actually takes, which is what SETTLING_SECONDS is guessing at
// *   - whether R2 SQL returns `json` columns nested or as encoded strings (see jsonColumn)
// *
// * ⚠️ Expect this to take upwards of SETTLING_SECONDS (~5 min) before the first row is readable.
// * That wait is the design working, not the harness hanging.
import { jsonColumn } from '@orca/schema/pool.ts'
import * as Effect from 'effect/Effect'

const CONSUMER = 'harness'
const KIND = 'pool.synthetic'
const POLL_SECONDS = 30
// * a broken pipeline should fail the run, not spin forever. Generous: the floor is SETTLING (~5 min)
// * plus the sink roll interval, and a cold catalog can take a while on the very first write.
const DEADLINE_SECONDS = 1800

type Args = { count: number; stage: string }

const args: Args = {
  count: Number(process.env.COUNT ?? 100),
  stage: process.env.STAGE ?? `dev_${process.env.USER ?? 'local'}`,
}

// * Read the deployed stack's own state rather than taking a URL and a key as arguments — the same
// * no-token path notes/data-architecture/alchemy.md documents for reading R2 from a script.
const stateGet = (fqn: string) =>
  Effect.tryPromise(async () => {
    const proc = Bun.spawn(
      [
        'bunx',
        'alchemy',
        'state',
        'get',
        '--stack',
        'OrcaPool',
        '--stage',
        args.stage,
        '--fqn',
        fqn,
      ],
      { stderr: 'pipe', stdout: 'pipe' },
    )
    const out = await new Response(proc.stdout).text()
    if ((await proc.exited) !== 0) {
      throw new Error(`alchemy state get ${fqn} failed: ${await new Response(proc.stderr).text()}`)
    }
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- JSON.parse is any; this is the boundary narrowing it
    return JSON.parse(out) as { attr?: Record<string, unknown> }
  })

const attrString = (state: { attr?: Record<string, unknown> }, key: string) => {
  const value = state.attr?.[key]
  return typeof value === 'string' ? value : ''
}

const resolve = Effect.gen(function* resolve() {
  const url = process.env.POOL_URL ?? attrString(yield* stateGet('Worker'), 'url')
  const key = process.env.POOL_KEY ?? attrString(yield* stateGet('AccessKey'), 'text')
  if (url === '' || key === '') {
    return yield* Effect.die(
      new Error('could not resolve the pool URL or access key — is the stack deployed?'),
    )
  }
  return { key, url: url.replace(/\/$/, '') }
})

const call = (
  target: { key: string; url: string },
  path: string,
  init?: { body?: unknown; method?: string },
) =>
  Effect.tryPromise(async () => {
    const response = await fetch(`${target.url}${path}`, {
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      headers: {
        authorization: `Bearer ${target.key}`,
        'content-type': 'application/json',
      },
      method: init?.method ?? 'GET',
    })
    const text = await response.text()
    if (!response.ok) {
      throw new Error(`${init?.method ?? 'GET'} ${path} → ${response.status}: ${text}`)
    }
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- JSON.parse is any; this is the boundary narrowing it
    return JSON.parse(text) as Record<string, unknown>
  })

const program = Effect.gen(function* harness() {
  const target = yield* resolve
  yield* Effect.log(`pool: ${target.url}`)

  // * start from zero so the run only ever sees its own records
  yield* call(target, '/reset', { body: { consumer: CONSUMER }, method: 'POST' })

  // * a nonce keeps repeated runs distinguishable in a pool that is append-only
  const nonce = crypto.randomUUID().slice(0, 8)
  const records = Array.from({ length: args.count }, (_, i) => ({
    attrs: { nonce },
    kind: KIND,
    observed_at: new Date().toISOString(),
    payload: { index: i, nonce, note: 'opaque to the pool' },
    producer: 'harness@1',
    subject: `${nonce}/${i}`,
  }))

  const appendedAt = Date.now()
  const appended = yield* call(target, '/append', { body: records, method: 'POST' })
  yield* Effect.log(`appended ${JSON.stringify(appended)}`)

  // * ── drain ────────────────────────────────────────────────────────────────────────────────
  const seen = new Map<string, number>()
  let firstVisibleAt: number | undefined
  let bisections = 0
  let columnForm = 'unknown'

  while (seen.size < args.count) {
    if (Date.now() - appendedAt > DEADLINE_SECONDS * 1000) {
      return yield* Effect.die(
        new Error(`only ${seen.size}/${args.count} records arrived within ${DEADLINE_SECONDS}s`),
      )
    }
    const result = yield* call(
      target,
      `/read?consumer=${CONSUMER}&kind=${encodeURIComponent(KIND)}&payload=true`,
    )
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the pool's own read envelope
    const rows = (result.rows ?? []) as Record<string, unknown>[]
    bisections += Number(result.bisections ?? 0)
    const through = typeof result.through === 'string' ? result.through : null

    for (const row of rows) {
      const subject = String(row.subject)
      seen.set(subject, (seen.get(subject) ?? 0) + 1)
      if (columnForm === 'unknown') {
        columnForm = typeof row.payload === 'string' ? 'encoded string' : 'nested value'
      }
      // * confirm the payload survived the round trip opaque and intact
      const payload = jsonColumn(row.payload)
      if (typeof payload !== 'object' || payload === null || !('index' in payload)) {
        return yield* Effect.die(
          new Error(`payload did not round-trip: ${JSON.stringify(payload)}`),
        )
      }
    }

    if (rows.length > 0) {
      firstVisibleAt ??= Date.now()
      yield* Effect.log(`read ${rows.length} (${seen.size}/${args.count}) through ${through}`)
    }

    // * ⚠️ commit only after the rows are accounted for. A consumer that died here would simply
    // * re-read the window — at-least-once, which is why every stage has to be idempotent.
    if (through !== null) {
      yield* call(target, '/commit', {
        body: { consumer: CONSUMER, through },
        method: 'POST',
      })
    }

    if (seen.size < args.count) {
      const waited = Math.round((Date.now() - appendedAt) / 1000)
      yield* Effect.log(`waiting… ${seen.size}/${args.count} after ${waited}s`)
      yield* Effect.sleep(`${POLL_SECONDS} seconds`)
    }
  }

  // * ── the assertions ───────────────────────────────────────────────────────────────────────
  const duplicated = [...seen.entries()].filter(([, n]) => n > 1)
  const missing = records.filter((record) => !seen.has(record.subject))

  yield* Effect.log('─'.repeat(72))
  yield* Effect.log(`delivered:        ${seen.size}/${args.count}`)
  yield* Effect.log(`duplicates:       ${duplicated.length}`)
  yield* Effect.log(`missing:          ${missing.length}`)
  yield* Effect.log(`window bisections: ${bisections}`)
  yield* Effect.log(`json column form: ${columnForm}`)
  if (firstVisibleAt !== undefined) {
    const latency = Math.round((firstVisibleAt - appendedAt) / 1000)
    yield* Effect.log(`append → readable: ${latency}s (settling is the floor, not the cause)`)
  }

  const health = yield* call(target, '/health')
  yield* Effect.log(`health: ${JSON.stringify(health)}`)

  if (duplicated.length > 0 || missing.length > 0) {
    return yield* Effect.die(
      new Error(
        `exactly-once violated: ${duplicated.length} duplicated, ${missing.length} missing`,
      ),
    )
  }
  yield* Effect.log('✅ exactly-once holds')
  return { delivered: seen.size, latencySeconds: firstVisibleAt }
})

await Effect.runPromise(program)

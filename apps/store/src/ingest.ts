// * The Engine: one pass in, version transitions out. This is the whole of the SCD2 logic —
// * everything else in the store reads the rows this writes.
// *
// * The shape of it, per entity kind:
// *   present, hash matches   → write nothing at all
// *   present, hash differs   → close the open version at captured_at, insert a new one
// *   present, no open version→ insert (birth)
// *   absent, absence observed→ close (death)
// *   absent, absence NOT observed → leave open and count it stale
// *
// * The last two lines are the point. `valid_to` says when a value stopped being true;
// * observation says when we last confirmed it. Conflating them is what makes the current
// * pipeline need `failedModelKeys`.
import type * as Cloudflare from 'alchemy/Cloudflare'
import * as Effect from 'effect/Effect'

import type { Observation, Pass, Row } from './pass.ts'
import { projectEndpoint, projectModel, projectProvider } from './pass.ts'

type Db = Cloudflare.D1.QueryDatabaseClient
type Statement = Cloudflare.D1.PreparedStatement

// * D1 platform limits (developers.cloudflare.com/d1/platform/limits): 100 bound parameters per
// * statement, and 1000 queries per Worker invocation. Rows are packed into multi-row inserts to
// * fit the first, which is also what keeps a bootstrap pass under the second.
const MAX_PARAMS = 100
const BATCH_SIZE = 40

// * composite keys are joined on a byte that cannot appear in a slug or a UUID
const KEY_SEP = '\u0000'

// * raised rather than died: an out-of-order pass is a caller mistake, not a broken store
export class PassOutOfOrder {
  readonly _tag = 'PassOutOfOrder'
  readonly message: string
  constructor(message: string) {
    this.message = message
  }
}

type VersionTable = {
  table: string
  keys: string[]
  // * extra columns loaded with the open versions, so the close-out decision can be made
  // * from what the store already knows about an entity that has now vanished
  probe: string[]
}

const PROVIDERS: VersionTable = { keys: ['slug'], probe: [], table: 'provider_versions' }
const MODELS: VersionTable = { keys: ['slug'], probe: [], table: 'model_versions' }
const ENDPOINTS: VersionTable = {
  keys: ['id'],
  probe: ['model_variant_permaslug', 'variant'],
  table: 'endpoint_versions',
}
const PRICING: VersionTable = {
  keys: ['endpoint_id', 'sku'],
  probe: [],
  table: 'endpoint_pricing',
}

const sha256 = (text: string) =>
  Effect.promise(async () => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  })

const keyOf = (spec: VersionTable, row: Row) =>
  spec.keys.map((column) => String(row[column])).join(KEY_SEP)

// * Hash the columns by name, sorted, so one comparison decides everything below. Sorted, and not
// * simply Object.values(), because otherwise the hash depends on the order of keys in the
// * projection literal — which is cosmetic, and which the repo's formatter will happily rewrite,
// * silently invalidating every hash in the store.
const hashOf = (columns: Row) =>
  sha256(JSON.stringify(Object.entries(columns).toSorted(([a], [b]) => a.localeCompare(b))))

const prepareRows = Effect.fn(function* prepare(spec: VersionTable, rows: readonly Row[]) {
  const prepared = new Map<string, { columns: Row; hash: string }>()
  for (const columns of rows) {
    const key = keyOf(spec, columns)
    if (prepared.has(key)) {
      return yield* Effect.die(`duplicate ${spec.table} key ${key.replaceAll(KEY_SEP, '/')}`)
    }
    prepared.set(key, { columns, hash: yield* hashOf(columns) })
  }
  return prepared
})

const runBatched = Effect.fn(function* run(db: Db, statements: readonly Statement[]) {
  for (let index = 0; index < statements.length; index += BATCH_SIZE) {
    yield* db.batch(statements.slice(index, index + BATCH_SIZE))
  }
  return statements.length
})

// * the projections in pass.ts are the source of truth for what a row is, and the migration has
// * to agree with them. Checking costs one pragma read and the alternative is a silently
// * half-written row that nothing complains about until a query returns nonsense.
const verifyColumns = Effect.fn(function* verify(
  db: Db,
  table: string,
  columns: readonly string[],
) {
  // * table names here are module constants, never input — inlined because pragma
  // * table-valued functions don't reliably accept bound arguments
  const info = yield* db.prepare(`SELECT name FROM pragma_table_info('${table}')`).all<{
    name: string
  }>()
  const declared = new Set(columns)
  const actual = new Set(info.results.map((column) => column.name))
  const missing = [...declared].filter((column) => !actual.has(column))
  const unwritten = [...actual].filter((column) => !declared.has(column))
  if (missing.length > 0 || unwritten.length > 0) {
    yield* Effect.die(
      `${table} does not match its projection — absent from the table: [${missing.join(', ')}], never written: [${unwritten.join(', ')}]`,
    )
  }
})

const insertRows = Effect.fn(function* insert(
  db: Db,
  table: string,
  conflict: readonly string[],
  rows: readonly Row[],
) {
  const columns = Object.keys(rows[0] ?? {})
  yield* verifyColumns(db, table, columns)

  const perStatement = Math.max(1, Math.floor(MAX_PARAMS / columns.length))
  const tuple = `(${columns.map(() => '?').join(', ')})`
  const statements: Statement[] = []
  for (let index = 0; index < rows.length; index += perStatement) {
    const chunk = rows.slice(index, index + perStatement)
    statements.push(
      db
        .prepare(
          `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${chunk.map(() => tuple).join(', ')} ON CONFLICT (${conflict.join(', ')}) DO NOTHING`,
        )
        .bind(...chunk.flatMap((row) => columns.map((column) => row[column] ?? null))),
    )
  }
  return yield* runBatched(db, statements)
})

type Transitions = {
  opened: number
  changed: number
  closed: number
  stale: number
  unchanged: number
}

const upsertVersions = Effect.fn(function* upsert(
  db: Db,
  captured_at: string,
  spec: VersionTable,
  rows: ReadonlyMap<string, { columns: Row; hash: string }>,
  closable: (open: Row) => boolean,
) {
  const selected = [...spec.keys, 'valid_from', 'hash', ...spec.probe]
  const open = yield* db
    .prepare(`SELECT ${selected.join(', ')} FROM ${spec.table} WHERE valid_to IS NULL`)
    .all<Row>()
  const openByKey = new Map<string, Row>()
  for (const row of open.results) {
    openByKey.set(keyOf(spec, row), row)
  }

  const transitions: Transitions = { changed: 0, closed: 0, opened: 0, stale: 0, unchanged: 0 }
  const toClose: Row[] = []
  const toInsert: Row[] = []

  // * what the pass says exists
  for (const [key, row] of rows) {
    const current = openByKey.get(key)
    const version = { ...row.columns, hash: row.hash, valid_from: captured_at, valid_to: null }
    if (current === undefined) {
      toInsert.push(version)
      transitions.opened += 1
      continue
    }
    if (current.hash === row.hash) {
      transitions.unchanged += 1
      continue
    }
    // * a pass can only have produced one value per key, so a second one means the payload for
    // * this captured_at changed under us. Closing a zero-length interval would corrupt the
    // * history rather than record it, so stop instead.
    if (current.valid_from === captured_at) {
      return yield* Effect.die(
        `${spec.table} ${key.replaceAll(KEY_SEP, '/')} already has a different version at ${captured_at}`,
      )
    }
    toClose.push(current)
    toInsert.push(version)
    transitions.changed += 1
  }

  // * what the pass doesn't mention — only an observed absence is a death
  for (const [key, current] of openByKey) {
    if (rows.has(key)) {
      continue
    }
    if (closable(current)) {
      toClose.push(current)
      transitions.closed += 1
    } else {
      transitions.stale += 1
    }
  }

  // * closes go first: exactly one open version per key is enforced by a partial unique index,
  // * so reopening before closing would (correctly) collide
  let statements = 0
  if (toClose.length > 0) {
    const where = spec.keys.map((column) => `${column} = ?`).join(' AND ')
    statements += yield* runBatched(
      db,
      toClose.map((row) =>
        db
          .prepare(`UPDATE ${spec.table} SET valid_to = ? WHERE ${where} AND valid_to IS NULL`)
          .bind(captured_at, ...spec.keys.map((column) => row[column] ?? null)),
      ),
    )
  }
  if (toInsert.length > 0) {
    statements += yield* insertRows(db, spec.table, [...spec.keys, 'valid_from'], toInsert)
  }

  // * the open set as it was *before* this pass — the pricing close-out needs the scope of
  // * endpoints that have just died
  return { openByKey, statements, transitions }
})

// * evidence, not success. A 404 is a real answer ("this scope has zero endpoints right now")
// * and licenses a close-out; a 5xx or a transport error answers nothing and must not.
const isEvidence = (observation: Observation) =>
  observation.error === undefined && observation.status !== undefined && observation.status < 500

// * the capture worker requests `variant ?? 'standard'`, so a missing variant *is* standard
const scopeOf = (permaslug: string, variant: string | undefined) =>
  `${permaslug}${KEY_SEP}${variant ?? 'standard'}`

export const ingest = Effect.fn(function* ingest(db: Db, pass: Pass) {
  const { captured_at } = pass

  // * SCD2 only composes forward. Re-ingesting the newest pass is allowed and converges on the
  // * same rows; ingesting an older one would interleave validity intervals, so it's refused.
  const newest =
    (yield* db
      .prepare('SELECT MAX(captured_at) AS latest FROM passes')
      .first<{ latest: string | null }>())?.latest ?? null
  if (newest !== null && captured_at < newest) {
    yield* Effect.fail(
      new PassOutOfOrder(`pass ${captured_at} predates the latest ingested pass ${newest}`),
    )
  }

  const evidence = pass.observations.filter(isEvidence)
  const observedScopes = new Set(
    evidence.map((observation) => scopeOf(observation.permaslug, observation.variant)),
  )
  const errored = pass.observations.length - evidence.length
  const fullyObserved = errored === 0

  // * evidence first: a failure part-way through ingest should leave a record of what was
  // * looked at, not silence
  const observations = yield* insertRows(
    db,
    'observations',
    ['captured_at', 'permaslug', 'variant'],
    pass.observations.map((observation) => ({
      captured_at,
      error: observation.error ?? null,
      permaslug: observation.permaslug,
      slug: observation.slug,
      status: observation.status ?? null,
      variant: observation.variant ?? 'standard',
    })),
  )

  // * Models and providers are deduplicated across the whole pass, so their evidence is the
  // * whole pass: nothing closes unless every scope answered. Deliberately conservative —
  // * endpoints get the precise per-scope treatment, because that is where an absence is a fact
  // * about one provider's offering and where the current pipeline needed `failedModelKeys`.
  const providers = yield* upsertVersions(
    db,
    captured_at,
    PROVIDERS,
    yield* prepareRows(PROVIDERS, pass.providers.map(projectProvider)),
    () => fullyObserved,
  )
  const models = yield* upsertVersions(
    db,
    captured_at,
    MODELS,
    yield* prepareRows(MODELS, pass.models.map(projectModel)),
    () => fullyObserved,
  )
  const endpoints = yield* upsertVersions(
    db,
    captured_at,
    ENDPOINTS,
    yield* prepareRows(ENDPOINTS, pass.endpoints.map(projectEndpoint)),
    (open) =>
      observedScopes.has(scopeOf(String(open.model_variant_permaslug), String(open.variant))),
  )

  // * a price closes when its endpoint was observed and the SKU is gone from pricing_json, or
  // * when the endpoint itself just died. An open price with no endpoint at all is an anomaly,
  // * so it only closes on a pass that saw everything.
  const present = new Set(pass.endpoints.map((endpoint) => endpoint.id))
  const pricing = yield* upsertVersions(
    db,
    captured_at,
    PRICING,
    yield* prepareRows(
      PRICING,
      pass.endpoints.flatMap((endpoint) =>
        Object.entries(endpoint.pricing_json).map(([sku, value]) => ({
          endpoint_id: endpoint.id,
          sku,
          // * decimal strings upstream, except a few adapters that ship raw numbers — kept as
          // * text either way so no precision is invented
          value: String(value),
        })),
      ),
    ),
    (open) => {
      const endpointId = String(open.endpoint_id)
      if (present.has(endpointId)) {
        return true
      }
      const endpoint = endpoints.openByKey.get(endpointId)
      return endpoint === undefined
        ? fullyObserved
        : observedScopes.has(
            scopeOf(String(endpoint.model_variant_permaslug), String(endpoint.variant)),
          )
    },
  )

  const transitions = {
    endpoints: endpoints.transitions,
    models: models.transitions,
    pricing: pricing.transitions,
    providers: providers.transitions,
  }

  yield* db
    .prepare(
      `INSERT INTO passes (captured_at, ingested_at, scopes, observed, errored, transitions)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (captured_at) DO UPDATE SET ingested_at = excluded.ingested_at, transitions = excluded.transitions`,
    )
    .bind(
      captured_at,
      new Date().toISOString(),
      pass.observations.length,
      evidence.length,
      errored,
      JSON.stringify(transitions),
    )
    .run()

  return {
    captured_at,
    errored,
    observed: evidence.length,
    scopes: pass.observations.length,
    // * how many SQL statements the pass cost — the measurement that says whether a full
    // * rebuild from Layer 0 is cheap enough to keep calling this store disposable
    statements:
      observations +
      providers.statements +
      models.statements +
      endpoints.statements +
      pricing.statements +
      2,
    transitions,
  }
})

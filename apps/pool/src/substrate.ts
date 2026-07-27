// * Everything the artifact pool is made of, in one Effect.
// *
// * It is one file because the pieces are not independently meaningful: the sink needs the bucket's
// * name, the pipeline needs the stream's and the sink's names, and both tokens need the account id
// * literal embedded in their policy — which only the ambient Cloudflare environment can supply.
// * Splitting it would mean threading the account id through three modules to no benefit.
// *
// * The pool is: a stream you append to → a passthrough SQL pipeline → an Iceberg table in R2, plus
// * a small D1 table holding one cursor per consumer. That is the whole substrate.
import { STREAM_FIELDS } from '@orca/schema/pool.ts'
import * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Output from 'alchemy/Output'
import * as Effect from 'effect/Effect'

// * ⚠️ The sink's roll interval is the pool's own latency floor: rows only become visible to a
// * reader when a file rolls. 60s is Cloudflare's minimum for an R2 Data Catalog sink (below it,
// * compaction can't keep up with the small files). It is set to the minimum deliberately, because
// * SETTLING in ./cursor.ts has to exceed it — a smaller roll interval buys a smaller settling
// * window, and the settling window is what consumers wait out.
const ROLL_INTERVAL_SECONDS = 60

export type Substrate = Effect.Success<typeof Substrate>

export const Substrate = Effect.gen(function* substrate() {
  // * the account id has to be a literal inside each token's policy resource key, so it is read
  // * from the ambient environment rather than from a resource output
  const credentials = yield* yield* Cloudflare.CloudflareEnvironment
  const account = `com.cloudflare.api.account.${credentials.accountId}` as const

  // * ── the lake ─────────────────────────────────────────────────────────────────────────────
  const bucket = yield* Cloudflare.R2.Bucket('Lake')

  // * The sink writes Iceberg tables through the catalog, and the catalog runs its own maintenance
  // * jobs against the bucket — both under this token.
  // * 📌 This retracts artifact-pool.md §5's warning that the catalog token has to be made by hand
  // * in the dashboard: Alchemy models it as a resource with a typed permission-group catalog, so
  // * it is minted, rotated and destroyed with the stack like everything else.
  const writeToken = yield* Cloudflare.ApiToken.AccountApiToken('CatalogWriteToken', {
    policies: [
      {
        effect: 'allow',
        permissionGroups: [
          'Workers R2 Data Catalog Write',
          'Workers R2 Data Catalog Read',
          'Workers R2 Storage Write',
          'Workers R2 Storage Read',
        ],
        resources: { [account]: '*' },
      },
    ],
  })

  // * What consumers query with — read-only, and scoped to reads on purpose. A consumer that could
  // * write to the lake would make the pool's central claim (append-only, unrecoverable if wrong)
  // * a matter of trust rather than of permissions.
  const readToken = yield* Cloudflare.ApiToken.AccountApiToken('SqlReadToken', {
    policies: [
      {
        effect: 'allow',
        permissionGroups: [
          'Workers R2 SQL Read',
          'Workers R2 Data Catalog Read',
          'Workers R2 Storage Read',
        ],
        resources: { [account]: '*' },
      },
    ],
  })

  // * ⚠️ Compaction and snapshot expiration are the reason to use the managed catalog at all.
  // * A stream rolling a file a minute produces ~525k small files a year; small-file accumulation
  // * is the standard way a lakehouse rots (artifact-pool.md §5). Left to Cloudflare on purpose.
  const catalog = yield* Cloudflare.R2.DataCatalog('Catalog', {
    bucketName: bucket.bucketName,
    compaction: { state: 'enabled', targetSizeMb: '128' },
    // * snapshots are how a consumer's cursor could in principle be resolved to a table state, so
    // * they are kept well past any plausible consumer stall before being expired
    snapshotExpiration: { maxSnapshotAge: '7d', minSnapshotsToKeep: 10, state: 'enabled' },
    token: writeToken.value,
  })

  // * ── the pool ─────────────────────────────────────────────────────────────────────────────
  // * ⚠️ The schema is immutable: changing STREAM_FIELDS replaces the stream and the table with it.
  // * Authenticated, because an unauthenticated ingest endpoint is an open door into Layer 0 —
  // * the one layer whose contents cannot be recovered if someone writes junk into it.
  const stream = yield* Cloudflare.Pipelines.Stream('Appends', {
    format: { timestampFormat: 'rfc3339', type: 'json' },
    http: { authentication: true, enabled: true },
    schema: { fields: [...STREAM_FIELDS] },
  })

  // * What the Worker sends with. `Pipelines Send` is the whole grant — the append path can push
  // * events and cannot read, reconfigure or delete anything.
  const sendToken = yield* Cloudflare.ApiToken.AccountApiToken('StreamSendToken', {
    policies: [
      { effect: 'allow', permissionGroups: ['Pipelines Send'], resources: { [account]: '*' } },
    ],
  })

  const sink = yield* Cloudflare.Pipelines.Sink('Observations', {
    config: {
      bucket: bucket.bucketName,
      namespace: 'pool',
      rollingPolicy: { intervalSeconds: ROLL_INTERVAL_SECONDS },
      tableName: 'observations',
      token: writeToken.value,
    },
    format: { compression: 'zstd', type: 'parquet' },
    type: 'r2_data_catalog',
  })

  // * The pool transforms nothing. This is the one place a transform *could* live, and the whole
  // * point of the design is that it doesn't: interpretation happens in consumers, which can be
  // * re-run, not in the ingest path, which cannot.
  const pipeline = yield* Cloudflare.Pipelines.Pipeline('Land', {
    sql: Output.interpolate`INSERT INTO ${sink.name} SELECT kind, subject, observed_at, producer, attrs, payload FROM ${stream.name}`,
  })

  // * ── the consumer registry ────────────────────────────────────────────────────────────────
  // * Derived, rebuildable coordination state — never a system of record. Losing it costs every
  // * consumer a replay from zero, which is a cost, not a corruption. It is D1 rather than a
  // * Durable Object per consumer because lag monitoring wants every cursor in one query.
  const cursors = yield* Cloudflare.D1.Database('Cursors', { migrationsDir: './migrations' })

  // * The pool's own front-door credential, generated once and kept in stack state. Producers and
  // * consumers present it; without it `POST /append` would be an open write path into the one
  // * layer that cannot be repaired by re-running anything.
  const accessKey = yield* Alchemy.Random('AccessKey')

  return { accessKey, bucket, catalog, cursors, pipeline, readToken, sendToken, sink, stream }
})

# @orca/pool

The artifact pool. Producers append; each consumer holds its own cursor and reads everything past it
at whatever cadence it likes. That is the entire coordination mechanism, and it is what lets every
actor have an independent dial without negotiating with any other actor.

Design and reasoning: [notes/data-architecture/artifact-pool.md](../../notes/data-architecture/artifact-pool.md).

## It does not know what it carries

This is the property the pool exists to have, so it is worth being blunt about how it is enforced:

- `kind`, `subject`, `attrs` and `payload` are **opaque**. The pool validates that they are well
  formed and never that they mean anything.
- HTTP status and response headers live **inside `payload`**, not in the envelope. §2 requires
  headers be stored and be unreadable by every layer above; putting them inside the opaque payload
  makes that structural instead of a rule someone has to remember.
- There is **no `Row` schema** and the read path never decodes one. A row the pool parsed would be a
  row it could reject.

There is no OpenRouter code in this app, and there shouldn't be. Producers append to it.

## Shape

```
producer ──POST /append──▶ Pipelines Stream ──SQL passthrough──▶ Iceberg table in R2
                                                                        │
consumer ◀──GET /read / POST /commit── Worker ──R2 SQL over HTTP───────┘
                                          │
                                          └── D1: one cursor per consumer
```

| file                 | what it is                                                                     |
| -------------------- | ------------------------------------------------------------------------------ |
| `src/substrate.ts`   | every resource: bucket, catalog, three minted tokens, stream/sink/pipeline, D1 |
| `src/cursor.ts`      | the protocol — settling, window narrowing, cursor moves, lag                   |
| `src/r2-sql.ts`      | the read path: R2 SQL over its HTTP API                                        |
| `src/worker.ts`      | the routes and the lag cron                                                    |
| `scripts/harness.ts` | the end-to-end proof                                                           |

The envelope itself is in [`@orca/schema/pool.ts`](../../packages/schema/src/pool.ts), because
producers and consumers both need it.

## The one rule that matters

**A committed window has been delivered in full.** Two things protect it:

1. **Settling.** A read's upper bound is `now - SETTLING_SECONDS`, never the visible head. Rows
   become visible in batches when the sink rolls, so the newest part of the pool is still arriving;
   a naive `WHERE __ingest_ts > cursor` would step over a late arrival and never look back.
2. **Narrowing, not truncating.** If a window holds more rows than the requested limit, the window
   is halved until it fits. There is no SQL `LIMIT`, because rows can share an `__ingest_ts` to the
   millisecond — so no row-count boundary is also a safe cursor position. Only a time boundary is.

`SETTLING_SECONDS = 300` against a 60s sink roll interval puts a ~5 minute floor on freshness. That
is below the useful range of the dial for OpenRouter (see `openrouter.md` on why sub-5-minute polling
is wasted), so it costs nothing here — but it would cost something for a faster source, and the fix
then is a shorter roll interval, not a shorter settling.

## API

Everything except `/` requires `Authorization: Bearer <AccessKey>` — the generated key in stack state.

| route          | notes                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------- |
| `POST /append` | one envelope or an array. Chunked under the 5 MB ingest limit. Decodes the envelope only. |
| `GET /read`    | `?consumer=&kind=&limit=&window_seconds=&payload=true`. Returns rows + `through`.         |
| `POST /commit` | `{ consumer, through }`. Monotonic — a replayed commit is a no-op, never a rewind.        |
| `POST /reset`  | `{ consumer, to? }`. Reprocessing is a cursor reset; omit `to` to replay from zero.       |
| `GET /health`  | lag per consumer; **503** when any consumer is past its budget.                           |

A consumer that dies between read and commit re-reads the same window — at-least-once, which is why
every stage above has to be idempotent.

## Lag is not optional

§7 is explicit that a pool without lag monitoring is _strictly worse_ than the pipeline it replaces:
independent dials mean a consumer can stall silently while everything upstream looks healthy. Two
numbers, both derived, neither synced from producers:

- **ingest lag** — `now - MAX(__ingest_ts)`. Catches a dead producer or a broken pipeline, which no
  consumer's cursor would reveal.
- **consumer lag** — `MAX(__ingest_ts) - cursor`, per consumer. Catches the silent stall.

A cron computes both every 5 minutes and logs them; `/health` is the probe. A consumer that is behind
_and_ advancing is working through a backlog — `updated_at` is what tells the two apart.

## Running it

```bash
bun run deploy
```

```bash
bun run harness
```

The harness appends 100 synthetic records, drains them through read/commit, and asserts exactly-once.
It also reports the two things the design assumes rather than knows: the real append→readable
latency (which is what `SETTLING_SECONDS` is guessing at), and whether R2 SQL returns `json` columns
nested or as encoded strings. **Expect it to sit for ~5 minutes before the first row appears** — that
is the settling window working.

```bash
bun run destroy
```

## Landmines

- ⚠️ **The stream schema, the sink and the pipeline have no update API.** Changing `STREAM_FIELDS`
  replaces the stream, and the table with it. `attrs` exists so a producer that needs another field
  never has to.
- ⚠️ **Pipelines accepts an event that fails schema validation and then drops it.** The decode in
  `/append` is the only thing between a malformed append and a record that silently never exists.
- ⚠️ **`subject`, not `key`.** `KEY` is reserved in standard SQL and this column name is read by two
  SQL engines we don't control.
- 📌 **R2 SQL's response envelope is undocumented.** `rowsOf` accepts each plausible shape and fails
  loudly with the raw body rather than guessing; narrow it once the harness has run.
- 📌 The catalog, send and SQL-read tokens are all **minted by the stack**. This retracts
  `artifact-pool.md` §5's warning that the catalog token must be made by hand in the dashboard.

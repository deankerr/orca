// oxlint-disable sort-keys -- fields are grouped by what they are, not alphabetised

// * The vocabulary of the archive: what identifies a stored response, what we record about it, and
// * what the engine's HTTP surface says about both.
// *
// * Every id here is parsed, not validated — `BatchId`, `Author` and `ArtifactName` are the strings
// * an R2 key is spelled from, and two of the three now arrive from an HTTP caller. A parsed id
// * cannot forge a prefix, so the key builders in `apps/engine/src/artifacts.ts` take these types
// * and never re-check anything.
import * as DateTime from 'effect/DateTime'
import * as Schema from 'effect/Schema'

// * ── ids ───────────────────────────────────────────────────────────────────────────────────────

// * A crawl is named by the UTC moment it started, ISO-8601 with the colons dashed out. The format
// * is the index: every level of narrowing is a longer prefix, and lexicographic order is
// * chronological order. The pattern is the whole guarantee that a caller-supplied batch cannot
// * address anything but one crawl.
const BATCH_ID_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z$/

export const BatchId = Schema.String.check(Schema.isPattern(BATCH_ID_PATTERN))
  .pipe(Schema.brand('BatchId'))
  .annotate({ identifier: 'BatchId', description: 'a crawl, e.g. 2026-07-27T04-33-43Z' })
export type BatchId = Schema.Schema.Type<typeof BatchId>

// * Names the crawl starting now. Here rather than in the engine because the format and the pattern
// * that admits it are one decision, and this is the only place either is written.
// *
// * Seconds are enough to name a crawl; milliseconds would only add noise to a typed prefix. The
// * parse cannot fail — and if it ever does, the two halves of this decision have drifted apart,
// * which is worth a crash.
export const batchIdAt = (now: DateTime.Utc): BatchId =>
  Schema.decodeUnknownSync(BatchId)(`${DateTime.formatIso(now).slice(0, 19)}Z`.replaceAll(':', '-'))

// * OpenRouter's `author/model` id. The only invariant the key grammar needs is that it survives
// * being folded into one key segment, so `/` is the one character with meaning here — it becomes a
// * `.` — and whitespace is the one that cannot be there at all.
export const Permaslug = Schema.NonEmptyString.check(Schema.isPattern(/^\S+$/))
  .pipe(Schema.brand('Permaslug'))
  .annotate({ identifier: 'Permaslug', description: "OpenRouter's author/model id" })
export type Permaslug = Schema.Schema.Type<typeof Permaslug>

// * 'standard', 'free', 'thinking', … Deliberately not a literal union: a variant OpenRouter invents
// * tomorrow must still be crawlable. `.` is excluded because the variant is the last dot-segment of
// * an artifact's name, and that is what makes the name parseable back into a variant.
export const Variant = Schema.NonEmptyString.check(Schema.isPattern(/^[^\s./]+$/))
  .pipe(Schema.brand('Variant'))
  .annotate({ identifier: 'Variant', description: "a model variant, e.g. 'standard' or 'free'" })
export type Variant = Schema.Schema.Type<typeof Variant>

// * The author half of a permaslug, which is also the prefix that narrows a batch listing to one
// * author. Its own type because that is the only thing it is used for.
export const Author = Schema.NonEmptyString.check(Schema.isPattern(/^[^\s./]+$/))
  .pipe(Schema.brand('Author'))
  .annotate({ identifier: 'Author', description: 'the author half of a permaslug' })
export type Author = Schema.Schema.Type<typeof Author>

// * One stored endpoints response, named as the file is named within its batch:
// * `anthropic.claude-opus-5-20260723.standard`. It is a whole key segment, so it cannot contain a
// * `/` — which is also what stops a caller from walking out of the batch it names.
export const ArtifactName = Schema.NonEmptyString.check(Schema.isPattern(/^[^\s/]+$/))
  .pipe(Schema.brand('ArtifactName'))
  .annotate({
    identifier: 'ArtifactName',
    description: 'a stored response, e.g. anthropic.claude-opus-5-20260723.standard',
  })
export type ArtifactName = Schema.Schema.Type<typeof ArtifactName>

// * ── work ──────────────────────────────────────────────────────────────────────────────────────

// * One unit of work, encoded across the queue's process boundary: the producer and the consumer are
// * separate Worker invocations that agree on nothing else.
// *
// * ⚠️ Sent decoded rather than encoded. The branded type and its encoded form are the same three
// * strings at runtime, so a decoded value round-trips through the queue unchanged — and decoding on
// * the way in is what turns three catalog strings into ids the key builders will accept.
export const EndpointsQuery = Schema.Struct({
  batch: BatchId,
  permaslug: Permaslug,
  variant: Variant,
})
export type EndpointsQuery = Schema.Schema.Type<typeof EndpointsQuery>

// * ── observations ──────────────────────────────────────────────────────────────────────────────

// * An HTTP status as R2 object metadata holds it: a string, because every metadata value is.
const StatusCode = Schema.NumberFromString.check(
  Schema.isInt(),
  Schema.isBetween({ maximum: 599, minimum: 100 }),
).annotate({
  identifier: 'StatusCode',
})

// * What every stored object records about the moment it was captured. One schema, used in both
// * directions: `put` encodes it into `customMetadata`, a listing decodes it back out. Full
// * precision here, unlike the batch id — this is the time axis a consumer reads, not a prefix a
// * human types.
const observation = {
  observed_at: Schema.DateTimeUtcFromString,
  status: StatusCode,
}

export const CatalogObservation = Schema.Struct(observation)
export type CatalogObservation = Schema.Schema.Type<typeof CatalogObservation>

// * An endpoints response also carries what it is an observation *of*. The name in the key reads but
// * does not parse — model names contain their own dots — so identity lives in metadata, where a
// * listing can read it without fetching the object.
export const EndpointsObservation = Schema.Struct({
  ...observation,
  permaslug: Permaslug,
  variant: Variant,
})
export type EndpointsObservation = Schema.Schema.Type<typeof EndpointsObservation>

// * ── wire ──────────────────────────────────────────────────────────────────────────────────────

// * One page of a listing. R2 offers a forward cursor and nothing else, so this is the only paging
// * shape the archive can honestly offer: `cursor` is null when the listing is exhausted, and an
// * opaque string otherwise.
export const Page = <S extends Schema.Top>(item: S) =>
  Schema.Struct({
    items: Schema.Array(item),
    cursor: Schema.NullOr(Schema.String),
  })

// * A stored endpoints response as a listing sees it — everything a caller needs to decide whether
// * to fetch the body, and the `name` to fetch it with.
export const Artifact = Schema.Struct({
  name: ArtifactName,
  permaslug: Permaslug,
  variant: Variant,
  status: Schema.Int,
  observed_at: Schema.DateTimeUtcFromString,
  bytes: Schema.Int,
})
export type Artifact = Schema.Schema.Type<typeof Artifact>

export const ArtifactPage = Page(Artifact)

// * A crawl as the batch listing sees it: named by its own id, dated and sized by the catalog stored
// * at the start of it.
export const Batch = Schema.Struct({
  batch: BatchId,
  observed_at: Schema.DateTimeUtcFromString,
  bytes: Schema.Int,
})
export type Batch = Schema.Schema.Type<typeof Batch>

export const BatchPage = Page(Batch)

// * One crawl, counted. `catalog` is what the crawl intended to fetch and `endpoints` is what
// * landed — the two are only equal for a crawl that fully completed, which is the point of
// * reporting them separately.
export const BatchDetail = Schema.Struct({
  batch: BatchId,
  catalog: Batch,
  endpoints: Schema.Struct({
    objects: Schema.Int,
    bytes: Schema.Int,
    // * how many landed at each HTTP status. A 404 here is a real observation — the endpoints API
    // * has no way to say "zero endpoints" — so this is the crawl's health summary, not its errors.
    statuses: Schema.Record(Schema.String, Schema.Int),
  }),
})
export type BatchDetail = Schema.Schema.Type<typeof BatchDetail>

// * What `POST /crawl` answers with: the batch the work was queued under, and the denominator it was
// * planned from. `queued` is below `models` by the skipped ones — no endpoint, or a `~` alias.
export const CrawlStarted = Schema.Struct({
  batch: BatchId,
  models: Schema.Int,
  queued: Schema.Int,
})
export type CrawlStarted = Schema.Schema.Type<typeof CrawlStarted>

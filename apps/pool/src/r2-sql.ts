// * The pool's read path: R2 SQL over HTTP, against the Iceberg table the sink writes.
// *
// * 📌 This endpoint is documented (r2-sql/query-data), which is what makes Worker consumers
// * possible at all — the CLI is otherwise the only published way to query a catalog table.
// * ⚠️ Its *response* shape is not documented. Rather than guess one and silently mis-read the
// * pool, `rowsOf` accepts each plausible envelope and fails loudly with the raw body if none
// * match. The first successful deploy tells us which it is; then this narrows to one.
import * as Effect from 'effect/Effect'
import * as Redacted from 'effect/Redacted'

const ENDPOINT = 'https://api.sql.cloudflarestorage.com/api/v1/accounts'

export type Row = Record<string, unknown>

export class R2SqlError extends Error {
  override readonly name = 'R2SqlError'
}

// * A single-quoted SQL string literal. R2 SQL publishes no bind-parameter syntax, so every value
// * reaching a query is interpolated — which makes this the only thing standing between an opaque,
// * producer-chosen `kind` and the query text. Quotes are doubled (standard SQL escaping) and
// * control characters are refused outright rather than escaped, because nothing legitimate in an
// * envelope field contains them.
export const literal = (value: string): Effect.Effect<string, R2SqlError> => {
  // oxlint-disable-next-line no-control-regex -- refusing control characters is the point
  if (/[\u0000-\u001F\u007F]/.test(value)) {
    return Effect.fail(new R2SqlError(`control character in SQL literal: ${JSON.stringify(value)}`))
  }
  return Effect.succeed(`'${value.replaceAll("'", "''")}'`)
}

// * Pull the row array out of whichever envelope R2 SQL wrapped it in.
const rowsOf = (body: unknown): Row[] | undefined => {
  if (Array.isArray(body)) {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- shape checked above; column types are the caller's business
    return body as Row[]
  }
  if (typeof body !== 'object' || body === null) {
    return undefined
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- narrowed to a non-null object above
  const record = body as Record<string, unknown>
  for (const candidate of [record.rows, record.result, record.data]) {
    if (Array.isArray(candidate)) {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- as above
      return candidate as Row[]
    }
    if (candidate !== null && typeof candidate === 'object') {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- narrowed to a non-null object above
      const nested = candidate as Record<string, unknown>
      if (Array.isArray(nested.rows)) {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- as above
        return nested.rows as Row[]
      }
    }
  }
  return undefined
}

export type Query = (sql: string) => Effect.Effect<Row[], R2SqlError>

// * A query function bound to one warehouse. `token` needs only R2 SQL read — see
// * `SqlReadToken` in ./substrate.ts for why the read path deliberately cannot write.
export const query = (options: {
  accountId: string
  bucket: string
  token: Redacted.Redacted
}): Query => {
  const url = `${ENDPOINT}/${options.accountId}/r2-sql/query/${options.bucket}`

  return (sql) =>
    Effect.tryPromise({
      catch: (cause) => new R2SqlError(`r2 sql request failed: ${String(cause)}`),
      try: async () => {
        const response = await fetch(url, {
          body: JSON.stringify({ query: sql }),
          headers: {
            authorization: `Bearer ${Redacted.value(options.token)}`,
            'content-type': 'application/json',
          },
          method: 'POST',
        })
        const text = await response.text()
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}: ${text}`)
        }
        return text
      },
    }).pipe(
      Effect.flatMap((text) =>
        Effect.try({
          catch: (cause) => new R2SqlError(`r2 sql returned non-JSON: ${String(cause)}`),
          // oxlint-disable-next-line typescript/no-unsafe-return -- narrowed by rowsOf below
          try: () => JSON.parse(text) as unknown,
        }).pipe(
          Effect.flatMap((body) => {
            const rows = rowsOf(body)
            if (rows === undefined) {
              return Effect.fail(
                new R2SqlError(`unrecognised r2 sql response envelope: ${text.slice(0, 400)}`),
              )
            }
            return Effect.succeed(rows)
          }),
        ),
      ),
    )
}

import * as Data from 'effect/Data'

/** Failure returned when Bun SQL or Drizzle rejects a database operation. */
export class ProductDatabaseError extends Data.TaggedError('ProductDatabaseError')<{
  readonly cause: unknown
}> {}

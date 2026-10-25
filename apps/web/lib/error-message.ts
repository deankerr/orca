import { ConvexError } from 'convex/values'

/** Readable text for a caught value; ConvexError data is a message or a structured value. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Catch clauses bind unknown; this is their single decoder.
export function errorMessage(error: unknown): string {
  if (error instanceof ConvexError) {
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- ConvexError data is typed any.
    return typeof error.data === 'string' ? error.data : JSON.stringify(error.data)
  }

  return error instanceof Error ? error.message : String(error)
}

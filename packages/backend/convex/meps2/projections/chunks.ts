import * as R from 'remeda'

/** Stay inside Convex transaction limits for metadata-heavy view rows. */
const MUTATION_CHUNK = 40

/** Values in id-sorted order. */
export function valuesById<T>(map: Map<string, T>): T[] {
  const values: T[] = []
  for (const id of [...map.keys()].toSorted()) {
    const value = map.get(id)

    if (value !== undefined) {
      values.push(value)
    }
  }
  return values
}

/**
 * If the view is empty, upsert every `after` entity instead of the planned subset.
 */
export function rewriteIfEmpty<T>(
  hasRows: boolean,
  after: Map<string, T>,
  planned: T[],
): { rewrite: boolean; upserts: T[] } {
  if (hasRows) {
    return { rewrite: false, upserts: planned }
  }

  return { rewrite: true, upserts: valuesById(after) }
}

/** Apply view upserts in transaction-sized chunks. */
export async function applyUpserts<Row>(
  upserts: Row[],
  apply: (upserts: Row[]) => Promise<{ upserted: number }>,
) {
  let upserted = 0
  for (const chunk of R.chunk(upserts, MUTATION_CHUNK)) {
    const result = await apply(chunk)
    upserted += result.upserted
  }
  return { upserted }
}

/** Apply endpoint unlists in transaction-sized chunks. */
export async function applyUnlists(
  ids: string[],
  apply: (ids: string[]) => Promise<{ unlisted: number }>,
) {
  let unlisted = 0
  for (const chunk of R.chunk(ids, MUTATION_CHUNK)) {
    const result = await apply(chunk)
    unlisted += result.unlisted
  }
  return { unlisted }
}

/** Append series rows in transaction-sized chunks. */
export async function appendRows<Row>(
  rows: Row[],
  append: (rows: Row[]) => Promise<{ inserted: number }>,
) {
  let inserted = 0
  for (const chunk of R.chunk(rows, MUTATION_CHUNK)) {
    const result = await append(chunk)
    inserted += result.inserted
  }
  return { inserted }
}

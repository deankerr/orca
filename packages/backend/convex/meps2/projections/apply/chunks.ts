import * as R from 'remeda'

const MUTATION_CHUNK = 40

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

export function rewriteIfEmpty<T>(
  hasRows: boolean,
  after: Map<string, T>,
  planned: { upserts: T[]; deletes: string[] },
) {
  if (hasRows) {
    return { rewrite: false, upserts: planned.upserts, deletes: planned.deletes }
  }
  return { rewrite: true, upserts: valuesById(after), deletes: [] as string[] }
}

export async function applyChunks<Row>(
  upserts: Row[],
  deletes: string[],
  apply: (args: { upserts: Row[]; deletes: string[] }) => Promise<{
    upserted: number
    deleted: number
  }>,
) {
  const chunks = R.chunk(upserts, MUTATION_CHUNK)
  if (chunks.length === 0) {
    if (deletes.length === 0) {
      return { upserted: 0, deleted: 0 }
    }
    return await apply({ upserts: [], deletes })
  }

  let upserted = 0
  let deleted = 0
  for (const [index, chunk] of chunks.entries()) {
    const result = await apply({
      upserts: chunk,
      deletes: index === chunks.length - 1 ? deletes : [],
    })
    upserted += result.upserted
    deleted += result.deleted
  }
  return { upserted, deleted }
}

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

export async function appendRows<Row>(
  rows: Row[],
  append: (rows: Row[]) => Promise<{ inserted: number }>,
) {
  const chunks = R.chunk(rows, MUTATION_CHUNK)
  let inserted = 0
  for (const chunk of chunks) {
    const result = await append(chunk)
    inserted += result.inserted
  }
  return { inserted }
}

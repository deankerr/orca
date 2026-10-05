import { validate } from 'convex-helpers/validators'
import { ConvexError, v } from 'convex/values'
import type { Infer } from 'convex/values'
import { gunzipSync } from 'fflate'

export const objectIdentity = v.object({ path: v.string(), name: v.string() })
export type ObjectIdentity = Infer<typeof objectIdentity>

export const nameSelection = v.object({
  path: v.string(),
  atOrAfter: v.string(),
  limit: v.number(),
  order: v.optional(v.union(v.literal('asc'), v.literal('desc'))),
})
export type NameSelection = Infer<typeof nameSelection>

/** Logical reads shared by deployment and standalone consumers. */
export interface ObjectReader {
  /** Read 1–100 identities in input order; missing identities return null. */
  loadMany: (identities: ObjectIdentity[]) => Promise<(string | null)[]>
  /** Return up to 100 names within the inclusive range, in the requested order. */
  namesAtOrAfter: (selection: NameSelection) => Promise<string[]>
}

/** Wire representation stays private to objects; consumers receive decoded text. */
const storedObject = v.object({ codec: v.literal('gzip'), bytes: v.bytes() })
export const storedBatch = v.array(v.union(v.null(), storedObject))
export type StoredObject = Infer<typeof storedObject>

export function assertReadCount(count: number): void {
  if (!Number.isInteger(count) || count < 1 || count > 100) {
    throw new ConvexError('Object reads require between 1 and 100 items')
  }
}

/** Check discovery responses at both the deployment and standalone reader interfaces. */
export function validateNames(names: unknown, selection: NameSelection): string[] {
  if (!validate(v.array(v.string()), names) || names.length > selection.limit) {
    throw new ConvexError('Object source returned invalid names')
  }

  for (const [index, name] of names.entries()) {
    const previous = names[index - 1]
    const outOfOrder =
      previous !== undefined && (selection.order === 'desc' ? name >= previous : name <= previous)

    if (name < selection.atOrAfter || outOfOrder) {
      throw new ConvexError('Object source returned names outside the requested order/range')
    }
  }

  return names
}

export function decode(stored: StoredObject | null): string | null {
  return stored === null ? null : new TextDecoder().decode(gunzipSync(new Uint8Array(stored.bytes)))
}

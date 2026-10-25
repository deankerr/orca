import { z } from 'zod'

export const Status = (noun: string, unlisted: string) =>
  z
    .enum(['listed', 'unlisted', 'all'])
    .default('listed')
    .meta({
      description: `Listing status; listed only by default. Unlisted ${noun} ${unlisted}`,
    })

/** Known models and providers remain selectable after their last listing ends. */
export const HasListings = (noun: string) =>
  z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional()
    .meta({
      description: `Only ${noun} with (\`true\`) or without (\`false\`) a listed endpoint; all known ${noun} by default.`,
    })

export function matchesListings(listedEndpoints: number, hasListings: boolean | undefined) {
  return hasListings === undefined || listedEndpoints > 0 === hasListings
}

export function matchesStatus(listed: boolean, status: 'listed' | 'unlisted' | 'all') {
  return status === 'all' || listed === (status === 'listed')
}

export const Order = z.enum(['asc', 'desc']).optional().meta({
  description:
    'Direction for `sort`, which it requires; `desc` by default. Unknown values sort last in either direction.',
})

/** Reject `order` without `sort`, which would otherwise be silently ignored. */
export function orderRequiresSort<T extends z.ZodType<{ order?: string; sort?: string }>>(
  schema: T,
) {
  return schema.refine(
    (selection) => selection.order === undefined || selection.sort !== undefined,
    {
      message: '`order` requires `sort`.',
      path: ['order'],
    },
  )
}

/** Numeric ordering with unknown values last in either direction. */
export function compareBy<T>(key: (entity: T) => number | null, order: 'asc' | 'desc' = 'desc') {
  return (left: T, right: T) => {
    const a = key(left)
    const b = key(right)
    if (a === null || b === null) {
      return Number(a === null) - Number(b === null)
    }
    return order === 'asc' ? a - b : b - a
  }
}

export function sortKeys<K extends string>(sorts: Record<K, unknown>) {
  return Object.keys(sorts).filter((key): key is K => Object.hasOwn(sorts, key))
}

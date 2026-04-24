import { v } from 'convex/values'
import * as R from 'remeda'

export const availabilityFields = {
  unavailable_at: v.optional(v.number()),
  updated_at: v.number(),
}

type AvailabilityShape = {
  unavailable_at?: number
  updated_at: number
}

function getCurrentCatalogTimestamp(items: AvailabilityShape[]) {
  let currentTime = 0

  for (const item of items) {
    if (item.updated_at > currentTime) {
      currentTime = item.updated_at
    }
  }

  return currentTime
}

export function filterByAvailabilityWindow<T extends AvailabilityShape>(
  items: T[],
  maxTimeUnavailable?: number,
) {
  if (!R.isDefined(maxTimeUnavailable)) {
    return items
  }

  const currentTime = getCurrentCatalogTimestamp(items)

  return items.filter(
    (item) =>
      !R.isDefined(item.unavailable_at) || item.unavailable_at >= currentTime - maxTimeUnavailable,
  )
}

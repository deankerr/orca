import { properties } from '@orca/properties'

import type { EndpointRow } from '#endpoints/snapshot'

import { formatDate } from './labels'

/** The region and tier that tell a provider's endpoints for one model apart, if it states them. */
export function endpointTag({ properties: active }: EndpointRow): string | null {
  const parts = (['region', 'service_tier'] as const).flatMap((id) => {
    const value = active.get(id)

    return value === undefined ? [] : [String(value)]
  })

  return parts.length === 0 ? null : parts.join(' · ')
}

/** What the tag means, for hover: the properties behind it. */
export function endpointTagDescription({ properties: active }: EndpointRow): string {
  return (['region', 'service_tier'] as const)
    .flatMap((id) =>
      active.has(id) ? [`${properties[id].name}: ${properties[id].description}`] : [],
    )
    .join(' ')
}

/**
 * The provider tag and the endpoint UUID, shown as `google-vertex/global · 90d0dbe6`: the UUID is
 * cut to its first eight characters for display, and copies whole.
 */
export function slugParts({ endpoint }: EndpointRow) {
  return { id: endpoint.id, shortId: endpoint.id.slice(0, 8), tag: endpoint.provider.tag }
}

/** `Unlisted since 2026-10-24` for an unlisted endpoint, else null. */
export function unlistedLine({ endpoint }: EndpointRow): string | null {
  return endpoint.unlisted_at === null ? null : `Unlisted since ${formatDate(endpoint.unlisted_at)}`
}

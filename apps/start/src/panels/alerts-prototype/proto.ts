/*
 * PROTOTYPE, throwaway. Four placements for Alerts on the Endpoints screen, switchable with
 * `?variant=`, on the existing `/` route. Answers "Where do Alerts live on the Endpoints screen, and
 * do they follow its filters?" (issue #260). Not for main.
 */
import { getRouteApi } from '@tanstack/react-router'
import { z } from 'zod'

export const VARIANTS = {
  A: 'Mode of Results',
  B: 'Panel in the left column',
  C: 'Band inside Results',
  D: 'Marks on Table rows',
} as const

export type Variant = keyof typeof VARIANTS

export const VARIANT_KEYS = ['A', 'B', 'C', 'D'] as const satisfies readonly Variant[]

export const protoSchema = z.object({
  /** Whether the variant's Alerts surface is showing. */
  alerts: z.boolean().default(true).catch(true),
  /** Whether the Endpoints filters narrow the Alerts. */
  follow: z.boolean().default(true).catch(true),
  variant: z.enum(VARIANT_KEYS).default('A').catch('A'),
})

export type Proto = z.output<typeof protoSchema>

export const protoDefaults = { alerts: true, follow: true, variant: 'A' } as const

const RouteApi = getRouteApi('/')

export function useProto(): Proto {
  return RouteApi.useSearch({
    select: ({ alerts, follow, variant }) => ({ alerts, follow, variant }),
    structuralSharing: true,
  })
}

export function useSetProto() {
  const navigate = RouteApi.useNavigate()

  return (change: Partial<Proto>) => {
    navigate({
      replace: true,
      resetScroll: false,
      search: (scope) => ({ ...scope, ...change }),
    }).catch(reportError)
  }
}

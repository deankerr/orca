import { db } from '@/convex/db'

import { internalMutation } from '../_generated/server'

const optionalFields = [
  'headquarters',
  'datacenters',
  'status_page_url',
  'terms_of_service_url',
  'privacy_policy_url',
  'unavailable_at',
] as const

export const fieldCoverage = internalMutation({
  args: {},
  handler: async (ctx) => {
    const providers = await db.or.views.providers.collect(ctx)

    // count providers with actual values for each optional field
    const counts: Record<string, number> = {}
    for (const field of optionalFields) {
      counts[field] = 0
    }

    for (const provider of providers) {
      for (const field of optionalFields) {
        const value = provider[field]
        if (value !== undefined && value !== null) {
          counts[field]!++
        }
      }
    }

    const result = {
      total: providers.length,
      available: providers.filter((p) => !p.unavailable_at).length,
      fields: counts,
    }

    console.log('[analysis:providers] field coverage', result)
    return result
  },
})

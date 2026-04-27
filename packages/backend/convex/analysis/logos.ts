import { resolveLogo } from '@orca/entity-logos'
import * as R from 'remeda'

import { internalMutation } from '../_generated/server'

type EntityRef = {
  name: string
  slug: string
}

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const models = await ctx.db.query('or_views_models').collect()
    const providers = await ctx.db.query('or_views_providers').collect()

    const uniqueModels = R.uniqueBy(models, (m) => m.slug)
    const uniqueProviders = R.uniqueBy(providers, (p) => p.slug)

    const modelsCoverage = computeCoverage(uniqueModels)
    const providersCoverage = computeCoverage(uniqueProviders)

    return { models: modelsCoverage, providers: providersCoverage }
  },
})

function computeCoverage(entities: EntityRef[]) {
  const missing: EntityRef[] = []

  for (const entity of entities) {
    if (resolveLogo(entity.slug) === undefined) {
      missing.push({ name: entity.name, slug: entity.slug })
    }
  }

  missing.sort((a, b) => a.slug.localeCompare(b.slug))

  return {
    covered: entities.length - missing.length,
    missing,
    total: entities.length,
  }
}

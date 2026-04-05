/**
 * Script to find entities (providers and models) that don't have logo icons.
 * Fetches data directly from Convex dev server.
 *
 * Run with: bun scripts/find-missing-logos.ts
 */

import { ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'

import { getLogo } from '../convex/shared/logos'

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL
if (CONVEX_URL === undefined || CONVEX_URL === '') {
  throw new Error('NEXT_PUBLIC_CONVEX_URL not set - check .env.local')
}

const client = new ConvexHttpClient(CONVEX_URL)

type Provider = {
  slug: string
  name: string
}

type Model = {
  slug: string
  author_slug: string
  author_name: string
}

async function fetchProviders(): Promise<Provider[]> {
  return client.query(
    makeFunctionReference<'query', Record<string, never>, Provider[]>('providers:list'),
  )
}

async function fetchModels(): Promise<Model[]> {
  return client.query(makeFunctionReference<'query', Record<string, never>, Model[]>('models:list'))
}

async function checkMissingLogos() {
  console.log('Fetching data from Convex...')

  const [providers, models] = await Promise.all([fetchProviders(), fetchModels()])

  console.log(`Fetched ${providers.length} providers and ${models.length} models\n`)

  // * Check providers
  const missingProviders: Array<{ slug: string; name: string }> = []
  for (const provider of providers) {
    const { avatarPath } = getLogo(provider.slug)
    if (avatarPath === undefined || avatarPath === '') {
      missingProviders.push({ slug: provider.slug, name: provider.name })
    }
  }

  // * Check models using full slug
  const modelsWithoutLogos: string[] = []
  for (const model of models) {
    const { avatarPath } = getLogo(model.slug)
    if (avatarPath === undefined || avatarPath === '') {
      modelsWithoutLogos.push(model.slug)
    }
  }

  // * Output results
  console.log('=== PROVIDERS WITHOUT LOGOS ===')
  console.log(`${missingProviders.length} providers:`)
  for (const { slug, name } of missingProviders.toSorted((a, b) => a.slug.localeCompare(b.slug))) {
    console.log(`  ${slug} (${name})`)
  }

  console.log('\n=== MODELS WITHOUT LOGOS ===')
  console.log(`${modelsWithoutLogos.length} models:`)
  for (const slug of modelsWithoutLogos.toSorted()) {
    console.log(`  ${slug}`)
  }
}

void checkMissingLogos()

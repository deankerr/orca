import { omit } from 'convex-helpers'
import { ConvexError } from 'convex/values'
import { z } from 'zod'

import { canonicalJson } from '../json'
import type { ScannedProvider } from './model'

const overrides = new Map([
  ['sambanova-turbo', 'sambanova'],
  ['nebius-fast', 'nebius'],
  ['wandb-legacy', 'wandb'],
  ['model-run', 'modelrun'],
  ['amazon-bedrock/claude-on-aws', 'claude-on-aws'],
  ['anthropic/claude-on-aws', 'claude-on-aws'],
  ['anthropic/2', 'claude-on-aws'],
])

/** ORCA identity policy; exact repairs precede the default slash-prefix grouping. */
export function providerId(slug: string): string {
  const slash = slug.indexOf('/')
  const prefix = slash === -1 ? slug : slug.slice(0, slash)
  return overrides.get(slug) ?? overrides.get(prefix) ?? prefix
}

const ProviderBody = z
  .object({
    slug: z.string(),
    dataPolicy: z.record(z.string(), z.json()).nullable().optional(),
  })
  .catchall(z.json())

/** Drop known endpoint defaults and internal configuration; new provider facts pass through. */
export function extractProvider(value: unknown) {
  const { slug, dataPolicy, ...body } = ProviderBody.parse(value)
  const facts = omit(body, [
    'adapterName',
    'baseUrl',
    'pricingStrategy',
    'regionOverrides',
    'hasChatCompletions',
    'hasCompletions',
    'isAbortable',
    'isMultipartSupported',
    'isPrivate',
    'moderationRequired',
    'requiredAttestationTypes',
    'editors',
    'owners',
    'ignoredProviderModels',
    'icon',
  ])

  if (dataPolicy !== undefined) {
    facts.dataPolicy =
      dataPolicy === null
        ? null
        : omit(dataPolicy, [
            'paidModels',
            'training',
            'trainingOpenRouter',
            'retainsPrompts',
            'retentionDays',
            'canPublish',
            'requiresUserIDs',
          ])
  }

  const provider: ScannedProvider = { ...facts, provider_id: providerId(slug) }
  return { slug, provider }
}

type ProviderObservation = ReturnType<typeof extractProvider>

/** Prefer canonical records, then the most common cleaned body; ties use canonical JSON order. */
export function assembleProviders(observations: ProviderObservation[]) {
  const groups = new Map<string, ProviderObservation[]>()

  for (const observation of observations) {
    const id = observation.provider.provider_id
    const group = groups.get(id) ?? []
    group.push(observation)
    groups.set(id, group)
  }

  return new Map(
    [...groups].map(([id, group]) => {
      const canonical = group.filter(({ slug }) => slug === id)
      const candidates = canonical.length > 0 ? canonical : group
      const votes = new Map<string, { provider: ProviderObservation['provider']; count: number }>()

      for (const { provider } of candidates) {
        const key = canonicalJson(provider)
        const vote = votes.get(key) ?? { provider, count: 0 }
        vote.count += 1
        votes.set(key, vote)
      }

      const [winner] = [...votes].toSorted(
        ([left, a], [right, b]) => b.count - a.count || (left < right ? -1 : Number(left > right)),
      )

      // Every group was created by an observation, so its candidate pool is nonempty.
      if (winner === undefined) {
        throw new ConvexError('Provider group has no observations')
      }

      return [id, winner[1].provider] as const
    }),
  )
}

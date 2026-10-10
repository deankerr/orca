import { omit } from 'convex-helpers'
import { ConvexError } from 'convex/values'
import { z } from 'zod'

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
    displayName: z.string(),
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

  const provider: ScannedProvider & { displayName: string } = {
    ...facts,
    provider_id: providerId(slug),
  }
  return { slug, provider }
}

export type ProviderObservation = ReturnType<typeof extractProvider> & { endpoint_id: string }

/** Select a base display name and one complete observation; see docs/orca/provider-identity.md. */
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
      // Base-slug observations usually carry the service label rather than a serving variant.
      const canonical = group.filter(({ slug }) => slug === id)
      const candidates = canonical.length > 0 ? canonical : group

      // Vote only on the label: URLs and unknown metadata must never split a name's votes.
      const votes = new Map<string, { observation: ProviderObservation; count: number }>()

      for (const observation of candidates) {
        const name = observation.provider.displayName
        const vote = votes.get(name) ?? { observation, count: 0 }
        vote.count += 1

        // UUID order selects one whole record without treating its metadata as more authoritative.
        if (observation.endpoint_id < vote.observation.endpoint_id) {
          vote.observation = observation
        }

        votes.set(name, vote)
      }

      const [winner] = [...votes].toSorted(
        ([left, a], [right, b]) => b.count - a.count || (left < right ? -1 : Number(left > right)),
      )

      // Every group was created by an observation, so its candidate pool is nonempty.
      if (winner === undefined) {
        throw new ConvexError('Provider group has no observations')
      }

      return [id, winner[1].observation.provider] as const
    }),
  )
}

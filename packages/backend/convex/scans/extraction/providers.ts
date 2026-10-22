import { ConvexError } from 'convex/values'
import * as R from 'remeda'
import { z } from 'zod'

import type { ExtractedProvider } from './schema'

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

// provider_info mixes provider facts with endpoint defaults. These behavioral claims
// belong to endpoint.data_policy, never the selected provider. Keep provider URLs,
// unknown facts, and their upstream camelCase names. See docs/orca/providers.md.
const omittedDataPolicyKeys = [
  'freeModels',
  'paidModels',
  'training',
  'trainingOpenRouter',
  'retainsPrompts',
  'retentionDays',
  'canPublish',
  'requiresUserIDs',
] as const

export const ProviderInput = z
  .object({
    dataPolicy: z.record(z.string(), z.json()).transform(R.omit(omittedDataPolicyKeys)).nullish(),
    displayName: z.string(),
    slug: z.string(),
  })
  .catchall(z.json())

export type ProviderInput = z.infer<typeof ProviderInput>

/** Inputs follow model-ID then endpoint-ID order; see docs/orca/providers.md. */
export function assembleProviders(providers: ProviderInput[]): Map<string, ExtractedProvider> {
  const groups = R.groupBy(providers, ({ slug }) => providerId(slug))

  return new Map(
    R.entries(groups).map(([id, group]) => {
      const { slug: _slug, ...provider } = selectProvider(id, group)
      return [id, { ...provider, provider_id: id }]
    }),
  )
}

function selectProvider(id: string, providers: ProviderInput[]): ProviderInput {
  const canonical = providers.filter(({ slug }) => slug === id)
  const candidates = canonical.length > 0 ? canonical : providers

  // Vote by label, then break label ties lexically; metadata never splits votes.
  const [winner] = R.pipe(
    candidates,
    R.groupBy(R.prop('displayName')),
    R.entries(),
    R.sortBy(
      ([, votes]) => -votes.length,
      ([name]) => name,
    ),
  )
  const representative = winner?.[1][0]

  if (representative === undefined) {
    throw new ConvexError({ message: 'Provider group has no observations', provider_id: id })
  }

  return representative
}

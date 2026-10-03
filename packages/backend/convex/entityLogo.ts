// Shared OpenRouter-slug → logo-service-URL resolution for the web app and backend.
// Each consumer supplies its own origin — localhost in web dev, the deployed domain
// in the backend — so this module stays origin-agnostic.

// Dedicated model-family logos, scoped to the slug prefix to avoid cross-brand matches.
const FAMILY_LOGO_KEYS_BY_PREFIX: Record<string, readonly string[]> = {
  anthropic: ['claude'],
  google: ['gemini', 'gemma'],
  meituan: ['longcat'],
  moonshotai: ['kimi'],
  'x-ai': ['grok'],
}

const ENTITY_LOGO_KEY_OVERRIDES: Record<string, string> = {
  'amazon-bedrock/claude-on-aws': 'anthropic',
  'amazon-nova': 'nova',
  'anthropic/claude-on-aws': 'anthropic',
  'claude-on-aws': 'anthropic',
  'wandb-legacy': 'wandb',
}

export type EntityLogoVariant = 'avatar' | 'dark' | 'light'

// Resolve exact overrides, then a family brand in the suffix, then the prefix.
// Provider suffixes such as "fp4" or "global" contain no family brand, so they fall
// through to the provider prefix (apart from explicit overrides like claude-on-aws).
// ponytail: relies on that suffix convention; add entity-aware matching if it changes.
function entityLogoKey(slug: string): string {
  const normalizedSlug = slug.toLowerCase()
  const [prefix = '', suffix = ''] = normalizedSlug.split('/')
  const familyKey = FAMILY_LOGO_KEYS_BY_PREFIX[prefix]?.find((key) => suffix.includes(key))

  return (
    ENTITY_LOGO_KEY_OVERRIDES[normalizedSlug] ??
    familyKey ??
    ENTITY_LOGO_KEY_OVERRIDES[prefix] ??
    prefix
  )
}

// Build the logo-service URL for a slug. The service returns its own fallback image for
// unknown keys, so an empty key maps to the explicit fallback asset.
export function entityLogoUrl(args: {
  origin: string
  slug: string
  variant: EntityLogoVariant
}): string {
  const key = entityLogoKey(args.slug)
  const origin = args.origin.replace(/\/$/, '')

  return `${origin}/v1/${args.variant}/${key === '' ? 'fallback' : key}.webp`
}

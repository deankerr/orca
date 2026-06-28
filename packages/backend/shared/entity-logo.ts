// Shared OpenRouter-slug → logo-service-URL resolution for the web app and backend.
// Each consumer supplies its own origin — localhost in web dev, the deployed domain
// in the backend — so this module stays origin-agnostic.

// Model families with a dedicated logo, keyed by their author. When a slug names one of
// these authors and the model segment contains the family name anywhere, we prefer the
// model-family logo over the author logo. Authors map uniquely to families, so this never
// picks the wrong logo.
const MODEL_LOGO_KEYS_BY_AUTHOR: Record<string, readonly string[]> = {
  anthropic: ['claude'],
  google: ['gemini', 'gemma'],
  moonshotai: ['kimi'],
  'x-ai': ['grok'],
}

export type EntityLogoVariant = 'avatar' | 'dark' | 'light'

// Derive the public logo key from an OpenRouter entity slug. Keys are lowercase and
// dash-free; an empty key means the slug had no usable author segment.
export function entityLogoKey(slug: string): string {
  const [author = '', model = ''] = slug.toLowerCase().split('/')
  const modelKey = MODEL_LOGO_KEYS_BY_AUTHOR[author]?.find((key) => model.includes(key))
  return (modelKey ?? author).replaceAll('-', '')
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

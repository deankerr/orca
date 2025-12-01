import manifest from './logos-manifest.json'

export interface LogoStyle {
  slug: string
  title: string
  background: string
  scale: number
}

const LOGOS_DIR = '/logos/web' as const

// Hardcoded transforms for special cases and vendor-specific naming
const TRANSFORMS: Array<[string, string]> = [
  ['google-ai-studio', 'aistudio'],
  ['google-vertex', 'vertexai'],
  ['amazon-bedrock', 'bedrock'],
]

const logos = new Map<string, LogoStyle>(Object.entries(manifest.logos))
const logoKeys = Array.from(logos.keys())

/**
 * Try to find the best matching logo from our manifest for a given input slug.
 */
function resolveLogo(slug: string): LogoStyle | undefined {
  if (!slug) return undefined

  // Apply transforms, remove dashes
  let normalized = slug.toLowerCase()
  for (const [from, to] of TRANSFORMS) {
    normalized = normalized.replaceAll(from, to)
  }
  normalized = normalized.replace(/-/g, '')

  // Split namespaces (e.g., "openai/gpt-4o") and try most specific first
  const parts = normalized.split('/').reverse()

  for (const part of parts) {
    // Prefix match: part starts with a logo key
    const prefixMatch = logoKeys.find((key) => part.startsWith(key))
    if (prefixMatch) {
      return logos.get(prefixMatch)
    }
  }

  return undefined
}

/**
 * Get logo URL and style data for a given slug
 */
export function getLogo(slug: string) {
  const style = resolveLogo(slug)
  const url = style ? `${LOGOS_DIR}/${style.slug}.png` : undefined
  return { url, style }
}

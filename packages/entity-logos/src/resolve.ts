import { z } from 'zod'

import manifest from '../output/manifest.json'
import { normalizeLogoKey } from './logo-key'

export type ResolvedLogo = {
  key: string
  avatarPath?: `/logos/avatar/${string}.webp`
  colorPath?: `/logos/color/${string}.png`
}

const LogoSchema = z.object({
  avatar: z.literal('webp').optional(),
  color: z.literal('png').optional(),
  key: z.string(),
})

const ManifestSchema = z.object({
  logos: z.array(LogoSchema),
})

const LOGO_KEY_REPLACEMENTS: Array<[string, string]> = [
  ['google-ai-studio', 'aistudio'],
  ['google-vertex', 'vertexai'],
  ['amazon-bedrock', 'bedrock'],
]

const { logos } = ManifestSchema.parse(manifest)
const logosByKey = new Map(logos.map((logo) => [logo.key, logo]))
const logoKeys = [...logosByKey.keys()].toSorted(
  (a, b) => b.length - a.length || a.localeCompare(b),
)

function normalizeInput(input: string): string {
  let normalized = input.toLowerCase()

  for (const [from, to] of LOGO_KEY_REPLACEMENTS) {
    normalized = normalized.replaceAll(from, to)
  }

  return normalizeLogoKey(normalized)
}

function findLogoKey(input: string): string | undefined {
  if (input === '') {
    return undefined
  }

  for (const part of normalizeInput(input).split('/').toReversed()) {
    const key = logoKeys.find((logoKey) => part.startsWith(logoKey))
    if (key !== undefined) {
      return key
    }
  }

  return undefined
}

export function resolveLogo(input: string): ResolvedLogo | undefined {
  const key = findLogoKey(input)
  if (key === undefined) {
    return undefined
  }

  const logo = logosByKey.get(key)
  if (logo === undefined) {
    return undefined
  }

  return {
    avatarPath: logo.avatar === 'webp' ? `/logos/avatar/${key}.webp` : undefined,
    colorPath: logo.color === 'png' ? `/logos/color/${key}.png` : undefined,
    key,
  }
}

import manifest from '../output/manifest.json'
import { normalizeLogoKey } from './keys'
import type { LogoEntry, LogoManifest } from './manifest'

export type ResolvedLogo = {
  key: string
  avatarPath?: `/logos/avatar/${string}.webp`
  colorPath?: `/logos/color/${string}.png`
}

const TRANSFORMS: Array<[string, string]> = [
  ['google-ai-studio', 'aistudio'],
  ['google-vertex', 'vertexai'],
  ['amazon-bedrock', 'bedrock'],
]

const rawManifest: unknown = manifest
const { logos } = parseManifest(rawManifest)
const logosByKey = new Map<string, LogoEntry>(logos.map((logo) => [logo.key, logo]))
const logoKeys = [...logosByKey.keys()].toSorted(
  (a, b) => b.length - a.length || a.localeCompare(b),
)

function parseManifest(value: unknown): LogoManifest {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('logos' in value) ||
    !Array.isArray(value.logos)
  ) {
    throw new Error('Invalid entity logos manifest')
  }

  return {
    logos: value.logos.map(parseManifestLogo),
  }
}

function parseManifestLogo(value: unknown): LogoEntry {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('key' in value) ||
    typeof value.key !== 'string'
  ) {
    throw new Error('Invalid entity logo manifest entry')
  }

  return {
    avatar: 'avatar' in value && value.avatar === 'webp' ? 'webp' : undefined,
    color: 'color' in value && value.color === 'png' ? 'png' : undefined,
    key: value.key,
  }
}

function normalizeInput(input: string): string {
  let normalized = input.toLowerCase()

  for (const [from, to] of TRANSFORMS) {
    normalized = normalized.replaceAll(from, to)
  }

  return normalizeLogoKey(normalized)
}

function resolveLogoEntry(input: string): LogoEntry | undefined {
  if (input === '') {
    return undefined
  }

  const parts = normalizeInput(input).split('/').toReversed()

  for (const part of parts) {
    const key = logoKeys.find((logoKey) => part.startsWith(logoKey))
    if (key !== undefined) {
      return logosByKey.get(key)
    }
  }

  return undefined
}

export function resolveLogo(input: string): ResolvedLogo | undefined {
  const logo = resolveLogoEntry(input)
  if (logo === undefined) {
    return undefined
  }

  return {
    avatarPath: logo.avatar === 'webp' ? `/logos/avatar/${logo.key}.webp` : undefined,
    colorPath: logo.color === 'png' ? `/logos/color/${logo.key}.png` : undefined,
    key: logo.key,
  }
}

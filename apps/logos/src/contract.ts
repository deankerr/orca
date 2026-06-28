// Keep the public URL contract in one runtime-neutral module.
export const PUBLIC_VERSION = 'v1'
export const ASSET_GROUPS = ['light', 'dark', 'avatar'] as const
const LOGO_IMAGE_EXTENSION = '.webp'
export const FALLBACK_FILE = `fallback${LOGO_IMAGE_EXTENSION}`

export type AssetGroup = (typeof ASSET_GROUPS)[number]

// Manifest paths are relative to the static asset root.
export function logoAssetManifestPath(args: { group: AssetGroup; key: string }): string {
  return `${PUBLIC_VERSION}/${args.group}/${logoAssetFile(args.key)}`
}

// Fallbacks follow the same group structure as normal logo assets.
export function fallbackAssetPath(group: AssetGroup): string {
  return `/${PUBLIC_VERSION}/${group}/${FALLBACK_FILE}`
}

// Output files are named only by the normalized entity key.
export function logoAssetFile(key: string): string {
  return `${key}${LOGO_IMAGE_EXTENSION}`
}

// The Worker should only turn missing public logo images into fallback images.
export function logoImageGroupForPathname(pathname: string): AssetGroup | undefined {
  if (!pathname.endsWith(LOGO_IMAGE_EXTENSION)) {
    return undefined
  }

  return ASSET_GROUPS.find((group) => pathname.startsWith(`/${PUBLIC_VERSION}/${group}/`))
}

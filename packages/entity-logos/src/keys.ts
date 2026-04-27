const EXTENSION_PATTERN = /\.(png|jpe?g|svg|webp)$/i

export function normalizeLogoKey(input: string): string {
  return input.replace(EXTENSION_PATTERN, '').toLowerCase().replaceAll('-', '')
}

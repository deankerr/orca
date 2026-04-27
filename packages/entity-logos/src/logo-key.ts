const FILE_EXTENSION = /\.(png|jpe?g|svg|webp)$/i

export function normalizeLogoKey(input: string): string {
  return input.replace(FILE_EXTENSION, '').toLowerCase().replaceAll('-', '')
}

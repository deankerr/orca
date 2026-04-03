export function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }
  return 'Abnormal Error'
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 3) + '...'
}

// Strip provider tag suffix — "deepinfra/fp4" → "deepinfra"
export function baseProviderSlug(slug: string): string {
  return slug.replace(/\/.*$/, '')
}

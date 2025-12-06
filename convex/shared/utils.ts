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

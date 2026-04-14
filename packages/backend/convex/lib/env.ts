export function getEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback

  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

export function getBooleanEnv(name: string, fallback?: boolean): boolean {
  const value = process.env[name]

  if (value === undefined) {
    if (fallback === undefined) {
      throw new Error(`Missing required environment variable: ${name}`)
    }

    return fallback
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === '1' || normalized === 'true') {
    return true
  }

  if (normalized === '0' || normalized === 'false') {
    return false
  }

  throw new Error(`Invalid boolean environment variable: ${name}=${value}`)
}

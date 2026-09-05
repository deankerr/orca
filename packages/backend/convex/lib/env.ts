import { env } from '../_generated/server'

export function getBooleanEnv(name: keyof typeof env, fallback?: boolean): boolean {
  const value = env[name]

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

export function getNumberEnv(name: keyof typeof env, fallback?: number): number {
  const value = env[name]

  if (value === undefined) {
    if (fallback === undefined) {
      throw new Error(`Missing required environment variable: ${name}`)
    }

    return fallback
  }

  const parsed = Number(value)
  if (Number.isFinite(parsed)) {
    return parsed
  }

  throw new Error(`Invalid number environment variable: ${name}=${value}`)
}

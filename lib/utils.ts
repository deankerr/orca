import { clsx, type ClassValue } from 'clsx'
import * as R from 'remeda'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Calculate percentage change between two numeric values
 * Returns null if either value is not a number or if old value is 0
 * Handles both numbers and strings by parsing strings first
 */
export function calculatePercentageChange(from: unknown, to: unknown): number | null {
  if (R.isBoolean(from) || R.isBoolean(to)) return null

  const fromValue = Number(from)
  const toValue = Number(to)

  // Check if both values are valid numbers
  if (isNaN(fromValue) || isNaN(toValue)) {
    return null
  }

  // Handle edge cases
  if (fromValue === 0) {
    // Can't calculate percentage change from 0, but we can show if new value is positive/negative
    return toValue !== 0 ? (toValue > 0 ? Infinity : -Infinity) : null
  }

  if (fromValue === toValue) {
    return 0
  }

  // Calculate percentage change: ((new - old) / old) * 100
  return ((toValue - fromValue) / Math.abs(fromValue)) * 100
}

/**
 * Build a URL for a Convex HTTP endpoint
 * Converts .convex.cloud to .convex.site and adds the path
 */
export function getConvexHttpUrl(path: string): string {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL

  if (!convexUrl) {
    throw new Error('NEXT_PUBLIC_CONVEX_URL environment variable is not set')
  }

  // Replace .convex.cloud with .convex.site
  const httpUrl = convexUrl.replace('.convex.cloud', '.convex.site')

  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  return `${httpUrl}${normalizedPath}`
}

export function withEnvironmentPrefix(text: string) {
  if (process.env.NODE_ENV === 'development') {
    return `🚧 ${text}`
  }
  if (process.env.VERCEL_ENV === 'preview') {
    return `🔍 ${text}`
  }
  return text
}

import { clsx } from 'clsx'
import type { ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Build a URL for a Convex HTTP endpoint
 * Converts .convex.cloud to .convex.site and adds the path
 */
export function getConvexHttpUrl(path: string): string {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL

  if (convexUrl === undefined || convexUrl === '') {
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

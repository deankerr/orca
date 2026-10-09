import { withPostHogConfig } from '@posthog/nextjs-config'
import type { NextConfig } from 'next'

import { getConvexHttpUrl } from './lib/utils'

// Preview credentials are shared, but the callback must return to this branch's web app.
const appUrl = new URL(
  process.env.NODE_ENV === 'development'
    ? (process.env.ORCA_DEV_URL ?? '')
    : process.env.VERCEL_ENV === 'preview'
      ? `https://${process.env.VERCEL_BRANCH_URL}`
      : 'https://orca.orb.town',
)

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_WORKOS_REDIRECT_URI: new URL('/callback', appUrl).href },
  allowedDevOrigins: [appUrl.hostname],
  // This is required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,
  reactCompiler: true,
  rewrites: async () => [
    // * posthog
    {
      source: '/snarf/static/:path*',
      destination: 'https://us-assets.i.posthog.com/static/:path*',
    },
    {
      source: '/snarf/:path*',
      destination: 'https://us.i.posthog.com/:path*',
    },
    // * public api preview
    {
      source: '/api/preview/v2/models',
      destination: getConvexHttpUrl('/public-api-preview/v2-cached'),
    },
  ],
  typescript: {
    // required until typescript 7 adds compiler api support
    ignoreBuildErrors: true,
  },
}

// sourcemap uploads require PostHog credentials, skip entirely in local dev
const posthogApiKey = process.env.POSTHOG_API_KEY
const posthogProjectId = process.env.POSTHOG_PROJECT_ID

export default posthogApiKey !== undefined && posthogProjectId !== undefined
  ? withPostHogConfig(nextConfig, { personalApiKey: posthogApiKey, projectId: posthogProjectId })
  : nextConfig

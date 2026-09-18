// oxlint-disable typescript/no-non-null-assertion -- Configuration requires these environment variables.
import { withPostHogConfig } from '@posthog/nextjs-config'
import type { NextConfig } from 'next'

import { getConvexHttpUrl } from './lib/utils'

// ignored by next if empty
const localDevOrigin = process.env.LOCAL_DEV_ORIGIN ?? ''

const nextConfig: NextConfig = {
  allowedDevOrigins: [localDevOrigin],
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
    // typescript 7 incompatibility
    ignoreBuildErrors: true,
  },
}

// sourcemap uploads require PostHog credentials, skip entirely in local dev
const withPostHog =
  process.env.POSTHOG_PROJECT_ID !== undefined && process.env.POSTHOG_API_KEY !== undefined
    ? (config: NextConfig) =>
        withPostHogConfig(config, {
          personalApiKey: process.env.POSTHOG_API_KEY!,
          projectId: process.env.POSTHOG_PROJECT_ID!,
        })
    : (config: NextConfig) => config

export default withPostHog(nextConfig)

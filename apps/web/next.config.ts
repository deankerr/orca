// oxlint-disable typescript/no-non-null-assertion config env vars
import { withPostHogConfig } from '@posthog/nextjs-config'
import type { NextConfig } from 'next'

import { getConvexHttpUrl } from './lib/utils'
import pkg from './package.json'

// version from package.json, e.g. "35.0.0" → "v35"
const appVersion = `v${pkg.version.split('.')[0]}`

// ignored by next if empty
const localDevOrigin = process.env.LOCAL_DEV_ORIGIN ?? ''

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
  allowedDevOrigins: [localDevOrigin],
  reactCompiler: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 't0.gstatic.com',
        pathname: '/faviconV2',
      },
    ],
  },
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
      destination: getConvexHttpUrl('/public-api-preview/v2'),
    },
  ],
  // This is required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,
}

// sourcemap uploads require PostHog credentials, skip entirely in local dev
const withPostHog =
  process.env.POSTHOG_PROJECT_ID === undefined
    ? (config: NextConfig) => config
    : (config: NextConfig) =>
        withPostHogConfig(config, {
          personalApiKey: process.env.POSTHOG_API_KEY!,
          projectId: process.env.POSTHOG_PROJECT_ID!,
          sourcemaps: {
            releaseVersion: appVersion,
          },
        })

export default withPostHog(nextConfig)

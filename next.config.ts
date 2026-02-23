import { execSync } from 'child_process'
import type { NextConfig } from 'next'

import bundleAnalyzer from '@next/bundle-analyzer'
import { withPostHogConfig } from '@posthog/nextjs-config'

import { getConvexHttpUrl } from './lib/utils'

// derive version from git tags, e.g. "v1" or "v1-3-gabcdef"
const appVersion = (() => {
  try {
    return execSync('git describe --tags --always').toString().trim()
  } catch {
    return process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'unknown'
  }
})()

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
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
  rewrites: async () => {
    return [
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
        source: '/api/preview/v1/models',
        destination: getConvexHttpUrl('/public-api-preview/v1'),
      },
      {
        source: '/api/preview/v2/models',
        destination: getConvexHttpUrl('/public-api-preview/v2'),
      },
    ]
  },
  // This is required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,
}

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

export default withBundleAnalyzer(
  withPostHogConfig(nextConfig, {
    personalApiKey: process.env.POSTHOG_API_KEY!,
    envId: process.env.POSTHOG_ENV_ID!,
    sourcemaps: {
      version: appVersion,
    },
  }),
)

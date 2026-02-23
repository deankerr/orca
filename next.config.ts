import type { NextConfig } from 'next'

import bundleAnalyzer from '@next/bundle-analyzer'
import { withPostHogConfig } from '@posthog/nextjs-config'

import { getConvexHttpUrl } from './lib/utils'
import pkg from './package.json'

// version from package.json, e.g. "35.0.0" → "v35"
const appVersion = `v${pkg.version.split('.')[0]}`

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

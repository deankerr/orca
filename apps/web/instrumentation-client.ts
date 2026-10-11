import posthogClient from 'posthog-js'

import { analyticsConfig } from '@/lib/analytics/config'

const analytics = analyticsConfig({
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV,
  key: process.env.NEXT_PUBLIC_POSTHOG_KEY,
  developmentEnabled: process.env.NEXT_PUBLIC_POSTHOG_DEV,
})

if (analytics.key !== undefined) {
  posthogClient.init(analytics.key, {
    api_host: '/snarf',
    ui_host: 'https://us.posthog.com',
    before_send: (event) => {
      if (event) {
        event.properties.app_environment = analytics.environment
        event.properties.app_version =
          process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? 'development'
      }

      return event
    },
    defaults: '2026-01-30',
    capture_exceptions: true,
    loaded: (posthog) => {
      // Remove legacy persisted versions; each tab reports the build it actually loaded.
      posthog.unregister('app_version')
      posthog.register_for_session({
        app_version: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? 'development',
      })
    },
  })
}

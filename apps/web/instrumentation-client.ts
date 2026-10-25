import posthogClient from 'posthog-js'

import { analyticsConfig } from '@/lib/analytics/config'
import { appVersion } from '@/lib/app-version'

const analytics = analyticsConfig({
  developmentEnabled: process.env.NEXT_PUBLIC_POSTHOG_DEV,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV,
  key: process.env.NEXT_PUBLIC_POSTHOG_KEY,
})

if (analytics.key !== undefined) {
  posthogClient.init(analytics.key, {
    api_host: '/snarf',
    before_send: (event) => {
      event.properties.app_environment = analytics.environment
      event.properties.app_version = appVersion

      return event
    },
    capture_exceptions: true,
    defaults: '2026-01-30',
    loaded: (posthog) => {
      // Remove legacy persisted versions; each tab reports the build it actually loaded.
      posthog.unregister('app_version')
      posthog.register_for_session({ app_version: appVersion })
    },
    ui_host: 'https://us.posthog.com',
  })
}

// oxlint-disable typescript/no-non-null-assertion -- Configuration requires these environment variables.
import posthogClient from 'posthog-js'

posthogClient.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
  api_host: '/snarf',
  ui_host: 'https://us.posthog.com',
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

import posthogClient from 'posthog-js'

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim()

// Keep preview and local activity out of production analytics, even if a key is present.
if (
  process.env.NEXT_PUBLIC_VERCEL_ENV === 'production' &&
  posthogKey !== undefined &&
  posthogKey !== ''
) {
  posthogClient.init(posthogKey, {
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
}

// oxlint-disable typescript/no-non-null-assertion -- Configuration requires these environment variables.
import posthogClient from 'posthog-js'

posthogClient.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
  api_host: '/snarf',
  ui_host: 'https://us.posthog.com',
  defaults: '2026-01-30',
  capture_exceptions: true,
})

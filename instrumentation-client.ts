import posthog from 'posthog-js'

posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
  api_host: '/snarf',
  ui_host: 'https://us.posthog.com',
  defaults: '2025-05-24',
  capture_exceptions: true,
  // debug: process.env.NODE_ENV === 'development',
})

// tag every event with the app version
posthog.register({ app_version: process.env.NEXT_PUBLIC_APP_VERSION })

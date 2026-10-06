'use client'

import { posthog } from 'posthog-js'
import { useEffect } from 'react'
import type { ReactNode } from 'react'

type AnalyticsUser = { id: string; email: string; name: string } | null

export function syncPostHogIdentity(user: AnalyticsUser) {
  // Instrumentation only initializes PostHog in production with a configured key.
  if (!posthog.config.token) {
    return
  }

  const previousUserId: unknown = posthog.get_property('$user_id')

  if (typeof previousUserId === 'string' && previousUserId !== user?.id) {
    const appVersion: unknown = posthog.get_property('app_version')

    posthog.reset()

    // Reset clears session properties too; the loaded build has not changed.
    if (typeof appVersion === 'string') {
      posthog.register_for_session({ app_version: appVersion })
    }
  }

  if (user) {
    posthog.identify(user.id, { email: user.email, name: user.name })
  }
}

export function PostHogIdentity({ user }: { user: AnalyticsUser }) {
  useEffect(() => {
    syncPostHogIdentity(user)
  }, [user])

  return null
}

export function PostHogSignOutForm({
  action,
  children,
}: {
  action: () => Promise<void>
  children: ReactNode
}) {
  return (
    <form
      action={action}
      onSubmit={() => {
        syncPostHogIdentity(null)
      }}
    >
      {children}
    </form>
  )
}

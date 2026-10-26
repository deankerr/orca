'use client'

import { posthog } from 'posthog-js'
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { z } from 'zod'

import { appVersion } from '@/lib/app-version'

const PersistedUserId = z.string().optional().catch(undefined)

type AnalyticsUser = { id: string; email: string; name: string } | null

export function syncPostHogIdentity(user: AnalyticsUser) {
  // Identity follows the same environment and key policy as all browser analytics.
  if (!posthog.config.token) {
    return
  }

  // PostHog types its persisted properties as any.
  const previousUserId = PersistedUserId.parse(posthog.get_property('$user_id'))

  if (previousUserId !== undefined && previousUserId !== user?.id) {
    posthog.reset()

    // Reset clears session properties too; the loaded build has not changed.
    posthog.register_for_session({ app_version: appVersion })
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

import { api } from '@orca/backend/convex/_generated/api'
import { withAuth } from '@workos-inc/authkit-nextjs'
import { fetchQuery } from 'convex/nextjs'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'

import { PageContainer, PageHeader, PageTitle } from '@/components/app-layout/pages'
import { Button } from '@/components/ui/button'

import { signOutAdmin } from './actions'
import { AdminProvider } from './provider'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await withAuth()

  // The sign-in route sets the PKCE cookie; server component rendering cannot write cookies.
  if (session.user === null) {
    redirect('/sign-in')
  }

  const { accessToken, ...auth } = session
  const viewer = await fetchQuery(api.admin.viewer, {}, { token: accessToken })

  if (!viewer.isAdmin) {
    return (
      <PageContainer>
        <PageHeader>
          <PageTitle>Administrator access required</PageTitle>
          <p className="text-xs text-muted-foreground">
            Signed in as {auth.user.email}. This account has not been granted admin access.
          </p>
          <p className="font-mono text-xs">{viewer.userId}</p>
          <form action={signOutAdmin}>
            <Button type="submit" variant="outline">
              Sign out
            </Button>
          </form>
        </PageHeader>
      </PageContainer>
    )
  }

  return (
    <AdminProvider key={auth.sessionId} initialAuth={auth}>
      {children}
    </AdminProvider>
  )
}

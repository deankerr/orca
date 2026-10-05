import { getSignInUrl } from '@workos-inc/authkit-nextjs'
import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const callback = new URL(process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI ?? '')
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')

  // Set the host-only PKCE cookie on the callback's origin, including Vercel branch aliases.
  if (host !== callback.host) {
    redirect(new URL('/sign-in', callback).href)
  }

  redirect(await getSignInUrl({ returnTo: '/admin' }))
}

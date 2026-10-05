'use server'

import { signOut } from '@workos-inc/authkit-nextjs'

export async function signOutAdmin() {
  await signOut({ returnTo: new URL('/', process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI).href })
}

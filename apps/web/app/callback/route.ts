import { handleAuth } from '@workos-inc/authkit-nextjs'
import * as R from 'remeda'

export const GET = handleAuth({
  // Next.js sees the internal HTTP server behind Portless; redirect to the public origin.
  ...R.pickBy({ baseURL: process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI }, R.isDefined),
  returnPathname: '/admin',
})

import { handleAuth } from '@workos-inc/authkit-nextjs'

export const GET = handleAuth({
  // Next.js sees the internal HTTP server behind Portless; redirect to the public origin.
  baseURL: process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI,
  returnPathname: '/admin',
})

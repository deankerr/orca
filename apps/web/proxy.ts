import { authkitProxy } from '@workos-inc/authkit-nextjs'

export default authkitProxy()

export const config = {
  // Read sessions on page requests, while leaving assets and public HTTP endpoints alone.
  matcher: ['/((?!api/|snarf/|_next/|favicon.ico|icon.svg|robots.txt|sitemap.xml).*)'],
}

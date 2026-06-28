import { fallbackAssetPath, logoImageGroupForPathname } from './contract'

// Unknown logo images get the fallback; non-logo paths stay normal 404s.
export default {
  async fetch(request, env) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', {
        headers: { allow: 'GET, HEAD' },
        status: 405,
      })
    }

    const url = new URL(request.url)
    const group = logoImageGroupForPathname(url.pathname)
    if (group === undefined) {
      return new Response('Not found', { status: 404 })
    }

    const fallbackUrl = new URL(fallbackAssetPath(group), request.url)
    const fallbackRequest = new Request(fallbackUrl.toString(), {
      headers: request.headers,
      method: request.method,
    })

    return env.ASSETS.fetch(fallbackRequest)
  },
} satisfies ExportedHandler<Env>

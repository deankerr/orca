import { httpAction } from '../_generated/server'
import { isNonEmptyString } from '../shared/utils'
import { load } from './index'

/** Retrieve a named object's uncompressed contents. */
export const serve = httpAction(async (ctx, req) => {
  const url = new URL(req.url)
  const path = url.searchParams.get('path')
  const name = url.searchParams.get('name')

  if (!isNonEmptyString(path) || !isNonEmptyString(name)) {
    return new Response('Missing path or name parameter', { status: 400 })
  }

  const text = await load(ctx, { path, name })

  if (text === null) {
    return new Response('Object not found', { status: 404 })
  }

  return new Response(text, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
})

// * Engine → Convex current-view delivery HTTP surface.
// *
// * POST /current/endpoints
// * Body: { endpoints: Endpoint[] }  — product cards matching packages/entities `toEndpoint`.
// * Auth: shared secret ENGINE_HTTP_API_KEY via `Authorization: Bearer <key>`.
// *
// * Unavailability marks are still open (see table.ts).
//
import { parse } from 'convex-helpers/validators'
import { v } from 'convex/values'
import { z } from 'zod'

import { isNonEmptyString } from '../../../shared/utils'
import { internal } from '../../_generated/api'
import { httpAction } from '../../_generated/server'
import { vCurrentEndpointProduct } from './table'

/** Outer envelope only — each endpoint is validated with the Convex product validator. */
const zBody = z.object({
  endpoints: z.array(z.unknown()).min(1),
})

const unauthorized = () => new Response('Unauthorized', { status: 401 })

const bearerToken = (req: Request): string | null => {
  const header = req.headers.get('Authorization')
  if (!isNonEmptyString(header)) {
    return null
  }
  const match = /^Bearer\s+(?<token>.+)$/i.exec(header.trim())
  return match?.groups?.token ?? null
}

export const upsertCurrentEndpoints = httpAction(async (ctx, req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const expected = process.env.ENGINE_HTTP_API_KEY
  if (!isNonEmptyString(expected)) {
    console.error('[current/endpoints] ENGINE_HTTP_API_KEY is not configured')
    return new Response('Server configuration error', { status: 500 })
  }

  const token = bearerToken(req)
  if (token === null || token !== expected) {
    return unauthorized()
  }

  let json: unknown
  try {
    json = await req.json()
  } catch {
    return new Response('Invalid JSON body', { status: 400 })
  }

  const body = zBody.safeParse(json)
  if (!body.success) {
    return Response.json(
      { error: 'Invalid body', issues: z.prettifyError(body.error) },
      { status: 400 },
    )
  }

  let endpoints
  try {
    endpoints = parse(v.array(vCurrentEndpointProduct), body.data.endpoints)
  } catch (error) {
    return Response.json(
      {
        error: 'Invalid endpoints',
        issues: error instanceof Error ? error.message : String(error),
      },
      { status: 400 },
    )
  }

  const result = await ctx.runMutation(internal.current.endpoints.mutations.upsert, {
    endpoints,
  })

  console.log({ result })

  return Response.json(result)
})

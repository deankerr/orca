// * Engine → Convex current-view delivery HTTP surface.
// *
// * POST /current/endpoints
// * Body: { endpoints: Endpoint[] }  — product cards matching packages/entities `toEndpoint`.
// *
// * Auth: none for now. Restrict when worker → Convex wiring is ready (shared secret, CF Access,
// * mTLS, or Convex deploy-key style header). Do not expose as a public product API.
// *
// * Unavailability marks are still open (see table.ts).
//
import { parse } from 'convex-helpers/validators'
import { v } from 'convex/values'
import { z } from 'zod'

import { internal } from '../../_generated/api'
import { httpAction } from '../../_generated/server'
import { vCurrentEndpointProduct } from './table'

/** Outer envelope only — each endpoint is validated with the Convex product validator. */
const zBody = z.object({
  endpoints: z.array(z.unknown()).min(1),
})

export const upsertCurrentEndpoints = httpAction(async (ctx, req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
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

  return Response.json(result)
})

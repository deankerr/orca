import type { Auth } from 'convex/server'
import { ConvexError, v } from 'convex/values'

import { env, query } from './_generated/server'

function isAdmin(subject: string | undefined): boolean {
  const adminUserId = env.ORCA_ADMIN_USER_ID ?? ''
  return adminUserId.length > 0 && subject === adminUserId
}

/** Application access is granted explicitly per deployment, independently of dashboard membership. */
export async function requireAdmin(ctx: { auth: Auth }) {
  const identity = await ctx.auth.getUserIdentity()

  if (identity === null || !isAdmin(identity.subject)) {
    throw new ConvexError('Administrator access required')
  }

  return identity
}

/** Exposes only the caller's identity so an unapproved administrator can finish setup. */
export const viewer = query({
  args: {},
  returns: v.object({ userId: v.union(v.string(), v.null()), isAdmin: v.boolean() }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()

    return {
      userId: identity?.subject ?? null,
      isAdmin: isAdmin(identity?.subject),
    }
  },
})

/** Harmless probe of the same authorization boundary future admin functions must use. */
export const demo = query({
  args: {},
  returns: v.object({ userId: v.string(), message: v.string() }),
  handler: async (ctx) => {
    const identity = await requireAdmin(ctx)

    return { userId: identity.subject, message: 'Administrator access verified' }
  },
})

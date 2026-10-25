import type { Auth } from 'convex/server'
import { ConvexError, v } from 'convex/values'

import { env, query } from '#generated/server'

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
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()

    return {
      isAdmin: isAdmin(identity?.subject),
      userId: identity?.subject ?? null,
    }
  },
  returns: v.object({ isAdmin: v.boolean(), userId: v.union(v.string(), v.null()) }),
})

/** Harmless probe of the same authorization boundary future admin functions must use. */
export const demo = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireAdmin(ctx)

    return { message: 'Administrator access verified', userId: identity.subject }
  },
  returns: v.object({ message: v.string(), userId: v.string() }),
})

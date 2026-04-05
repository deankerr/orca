import { EmbedBuilder } from '@discordjs/builders'
import { v } from 'convex/values'
import { up } from 'up-fetch'

import { internalAction } from '../_generated/server'
import { getEnv } from '../lib/env'

// Local up-fetch client for webhook calls (no bot auth needed)
const webhook = up(fetch, () => ({
  timeout: 60_000,
  retry: {
    attempts: 3,
    delay: (ctx) => Math.min(ctx.attempt ** 2 * 1000, 10_000),
    when: (ctx) => ctx.response?.status === 429 || (ctx.response?.status ?? 0) >= 500,
  },
}))

export const publish = internalAction({
  args: {
    title: v.string(),
    content: v.string(),
    dryRun: v.boolean(),
  },
  handler: async (_, args) => {
    const orcaPublicUrl = new URL(getEnv('ORCA_PUBLIC_URL'))
    const logoUrl = new URL('orb-logo.png', orcaPublicUrl)

    const embed = new EmbedBuilder()
      .setColor(0x34_98_db)
      .setAuthor({
        name: orcaPublicUrl.host,
        url: orcaPublicUrl.href,
        iconURL: logoUrl.href,
      })
      .setTitle(args.title)
      .setDescription(args.content)
      .setFooter({
        text: 'ORCA #releases',
        iconURL: logoUrl.href,
      })
      .setTimestamp(Date.now())
      .toJSON()

    const body = {
      embeds: [embed],
    }

    if (args.dryRun) {
      console.log('[discord/releases:publish] dry run - would send message')
      return body
    }

    console.log('[discord/releases:publish] sending message...')
    await webhook(getEnv('DISCORD_WEBHOOK_ORCA_RELEASES'), {
      method: 'POST',
      body,
    })
    console.log('[discord/releases:publish] message dispatched')

    return body
  },
})

import { EmbedBuilder } from '@discordjs/builders'
import type { RESTPostAPIWebhookWithTokenJSONBody } from 'discord-api-types/v10'

import { entityLogoUrl } from '../../../entityLogo'
import type { EntityAlert } from '../../shared/alerts/curate'

export type Card = RESTPostAPIWebhookWithTokenJSONBody

export type DiscordUrls = { publicUrl: string; logoOrigin: string }

export const colors = { added: 0x22_c5_5e, removed: 0xef_44_44, updated: 0x3b_82_f6 }

/** Arrivals carry `after`, departures `before`, and updates `changes`. */
export function lifecycleColor(event: EntityAlert): number {
  if ('after' in event) {
    return colors.added
  }

  return 'before' in event ? colors.removed : colors.updated
}

/** Discord transport details receive display-ready identity and content, never event data. */
export function embedCard(
  content: string,
  options: {
    author: { name: string; url: string; iconURL: string }
    timestamp: string
    color: number
    footer?: { text: string; iconURL?: string } | undefined
    title?: string | undefined
  },
): Card {
  const author = {
    ...options.author,
    name: truncateContent(options.author.name, 256, 'embed.author'),
  }

  const footer =
    options.footer === undefined
      ? undefined
      : {
          ...options.footer,
          text: truncateContent(options.footer.text, 2048, 'embed.footer'),
        }

  const title =
    options.title === undefined ? undefined : truncateContent(options.title, 256, 'embed.title')

  const descriptionLimit = Math.min(
    4096,
    6000 - author.name.length - (footer?.text.length ?? 0) - (title?.length ?? 0),
  )

  const embed = new EmbedBuilder()
    .setColor(options.color)
    .setAuthor(author)
    .setTimestamp(new Date(options.timestamp))

  // Discord rejects empty descriptions; a titled discovery without facts needs none.
  if (content !== '') {
    embed.setDescription(truncateContent(content, descriptionLimit, 'embed.description'))
  }

  if (footer !== undefined) {
    embed.setFooter(footer)
  }

  if (title !== undefined) {
    embed.setTitle(title)
  }

  return { embeds: [embed.toJSON()] }
}

export function gridUrl(query: string, urls: DiscordUrls, uuid?: string): string {
  const url = new URL(urls.publicUrl)
  url.searchParams.set('q', query)

  if (uuid !== undefined) {
    url.searchParams.set('uuid', uuid)
  }

  return url.href
}

export function logoUrl(slug: string, urls: DiscordUrls): string {
  return entityLogoUrl({ origin: urls.logoOrigin, slug, variant: 'avatar' })
}

/** Size is a presentation constraint, not a reason to lose an alert. */
export function truncateContent(content: string, limit: number, field: string): string {
  if (content.length > limit) {
    console.error('[discord] truncated card content', { field, length: content.length, limit })

    return `${content.slice(0, limit - 3)}...`
  }

  return content
}

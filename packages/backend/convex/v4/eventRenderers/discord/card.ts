import {
  ContainerBuilder,
  EmbedBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from '@discordjs/builders'
import { ConvexError } from 'convex/values'
import { MessageFlags } from 'discord-api-types/v10'
import type { RESTPostAPIWebhookWithTokenJSONBody } from 'discord-api-types/v10'

import { entityLogoUrl } from '../../../shared/entityLogo'

export type Card = RESTPostAPIWebhookWithTokenJSONBody
export type DiscordUrls = { publicUrl: string; logoOrigin: string }

export const colors = { added: 0x22_c5_5e, updated: 0x3b_82_f6, removed: 0xef_44_44 }

/** Discord transport details receive display-ready identity and content, never event data. */
export function embedCard(
  content: string,
  options: {
    author: { name: string; url: string; iconURL: string }
    timestamp: string
    color: number
    footer?: { text: string; iconURL: string }
  },
): Card {
  const embed = new EmbedBuilder()
    .setColor(options.color)
    .setAuthor(options.author)
    .setTimestamp(new Date(options.timestamp))
    .setDescription(content)

  if (options.footer !== undefined) {
    embed.setFooter(options.footer)
  }

  return { embeds: [embed.toJSON()] }
}

/** One text section and thumbnail; enforce the complete card's text budget before serialization. */
export function componentCard(
  content: string,
  options: {
    color: number
    thumbnail: { url: string; description: string }
  },
): Card {
  // ponytail: one event per message; split oversized events when full large-event delivery is needed.
  if (content.length > 4000) {
    throw new ConvexError('Discord event exceeds the single-message text limit.')
  }

  const section = new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
    .setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(options.thumbnail.url)
        .setDescription(options.thumbnail.description),
    )
  const container = new ContainerBuilder()
    .setAccentColor(options.color)
    .addSectionComponents(section)

  return { flags: MessageFlags.IsComponentsV2, components: [container.toJSON()] }
}

export function gridUrl(query: string, urls: DiscordUrls): string {
  const url = new URL(urls.publicUrl)
  url.searchParams.set('q', query)

  return url.href
}

export function logoUrl(slug: string, urls: DiscordUrls): string {
  return entityLogoUrl({ origin: urls.logoOrigin, slug, variant: 'dark' })
}

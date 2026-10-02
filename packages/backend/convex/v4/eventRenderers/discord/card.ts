import {
  ContainerBuilder,
  EmbedBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from '@discordjs/builders'
import { MessageFlags } from 'discord-api-types/v10'
import type { RESTPostAPIWebhookWithTokenJSONBody } from 'discord-api-types/v10'

import { entityLogoUrl } from '../../../shared/entityLogo'
import { truncate } from '../../../shared/utils'

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
  const descriptionLimit = Math.min(4096, 6000 - author.name.length - (footer?.text.length ?? 0))

  const embed = new EmbedBuilder()
    .setColor(options.color)
    .setAuthor(author)
    .setTimestamp(new Date(options.timestamp))
    .setDescription(truncateContent(content, descriptionLimit, 'embed.description'))

  if (footer !== undefined) {
    embed.setFooter(footer)
  }

  return { embeds: [embed.toJSON()] }
}

/** One text section and thumbnail; reserve space for the delivery source-ID annotation. */
export function componentCard(
  content: string,
  options: {
    color: number
    thumbnail: { url: string; description: string }
  },
): Card {
  const section = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(truncateContent(content, 3900, 'component.content')),
    )
    .setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(options.thumbnail.url)
        .setDescription(
          truncateContent(options.thumbnail.description, 1024, 'component.thumbnail'),
        ),
    )
  const container = new ContainerBuilder()
    .setAccentColor(options.color)
    .addSectionComponents(section)

  return { flags: MessageFlags.IsComponentsV2, components: [container.toJSON()] }
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
    console.error('[v4:discord] truncated card content', { field, length: content.length, limit })
  }

  return truncate(content, limit)
}

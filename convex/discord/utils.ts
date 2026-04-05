import type { APIEmbed, RESTPostAPIWebhookWithTokenJSONBody } from 'discord-api-types/v10'

import { getEnv } from '../lib/env'
import { getLogo } from '../shared/logos'
import { isNonEmptyString } from '../shared/utils'

export type DiscordPayload = RESTPostAPIWebhookWithTokenJSONBody & {
  embeds?: APIEmbed[]
}

export function getAuthorUrl(slug: string, uuid?: string): string {
  const baseUrl = getEnv('ORCA_PUBLIC_URL')
  const uuidParam = isNonEmptyString(uuid) ? `&uuid=${uuid.slice(0, 6)}` : ''
  return `${baseUrl}/?q=${slug}${uuidParam}`
}

export function getColorIconUrl(model_slug: string): string | undefined {
  const { colorPath } = getLogo(model_slug)
  if (!isNonEmptyString(colorPath)) {
    return undefined
  }

  const baseUrl = getEnv('ORCA_PUBLIC_URL')
  return `${baseUrl}/_next/image?url=${colorPath}&w=32&q=75`
}

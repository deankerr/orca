import type { APIEmbed, RESTPostAPIWebhookWithTokenJSONBody } from 'discord-api-types/v10'

import { getEnv } from '../lib/env'
import { entityLogoUrl } from '../shared/entityLogo'
import { isNonEmptyString } from '../shared/utils'

export type DiscordPayload = RESTPostAPIWebhookWithTokenJSONBody & {
  embeds?: APIEmbed[]
}

export function getEndpointsGridUrl(slug: string, uuid?: string): string {
  const url = new URL(getEnv('ORCA_PUBLIC_URL'))
  url.searchParams.set('q', slug)
  if (isNonEmptyString(uuid)) {
    url.searchParams.set('uuid', uuid.slice(0, 6))
  }
  return url.toString()
}

// Discord renders embed icons from absolute URLs, so always use the deployed logo service
// origin (never localhost) and the dark variant that reads well on Discord's dark surfaces.
export function getLogoIconUrl(slug: string): string {
  return entityLogoUrl({ origin: getEnv('ENTITY_LOGO_SERVICE_ORIGIN'), slug, variant: 'dark' })
}

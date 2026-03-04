import type { APIEmbed, RESTPostAPIWebhookWithTokenJSONBody } from 'discord-api-types/v10'

import { getEnv } from '../../lib/env'
import { getLogo } from '../../shared/logos'
import { DOT_SPACER, EMOJIS } from '../constants'

export type DiscordPayload = RESTPostAPIWebhookWithTokenJSONBody & {
  embeds?: APIEmbed[]
}

export type EmbedResult = APIEmbed

export function getColorIconUrl(model_slug: string): string | undefined {
  const { colorPath } = getLogo(model_slug)
  if (!colorPath) return undefined

  const baseUrl = getEnv('ORCA_PUBLIC_URL')
  return `${baseUrl}/_next/image?url=${colorPath}&w=32&q=75`
}

export function mono(value: unknown) {
  return `\`${String(value)}\``
}

export function isMissing(value: unknown): boolean {
  return value === undefined || value === null
}

export function getFieldLabel(field: string, before: unknown, after: unknown): string {
  if (isMissing(before)) return `${field} ${EMOJIS.new}`
  if (isMissing(after)) return `${field} ${EMOJIS.delete}`
  return `${field} ${EMOJIS.update}`
}

export function formatValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? EMOJIS.checkmark : EMOJIS.cross
  if (value === null || value === undefined) return mono('null')
  if (typeof value === 'number')
    return mono(value.toLocaleString(undefined, { maximumFractionDigits: 20 }))
  if (typeof value === 'string')
    return mono(value.length > 100 ? value.slice(0, 100) + '...' : value)
  return mono(JSON.stringify(value))
}

export function formatArrayDiff(before: unknown[], after: unknown[]): string {
  const beforeSet = new Set(before.map(String))
  const afterSet = new Set(after.map(String))

  const added = after.filter((item) => !beforeSet.has(String(item))).map(String)
  const removed = before.filter((item) => !afterSet.has(String(item))).map(String)

  const lines: string[] = []
  for (const item of removed) lines.push(`- ${item}`)
  for (const item of added) lines.push(`+ ${item}`)

  return lines.length > 0 ? `\`\`\`diff\n${lines.join('\n')}\n\`\`\`` : ''
}

export function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = parseFloat(value)
    return isNaN(parsed) ? null : parsed
  }
  return null
}

export function formatDelta(before: number | null, after: number | null): string {
  if (before === null || after === null || before === 0) return ''
  const percentChange = ((after - before) / before) * 100
  const arrow = percentChange > 0 ? EMOJIS.arrowUp : EMOJIS.arrowDown
  return `${arrow}${Math.abs(percentChange).toFixed(0)}%`
}

export function buildEntityLinks(args: {
  model_slug: string
  hugging_face_id?: string
  provider_tag_slug?: string
  endpoint_uuid?: string
}): string {
  const { model_slug, hugging_face_id, provider_tag_slug, endpoint_uuid } = args

  const orcaPublicUrl = getEnv('ORCA_PUBLIC_URL')

  const orcaParams = endpoint_uuid
    ? `?q=${model_slug}&uuid=${endpoint_uuid.slice(0, 8)}`
    : `?q=${model_slug}`

  const links = [
    `[⚪ ORCA](${orcaPublicUrl}/${orcaParams})`,
    `[🔀 Model](https://openrouter.ai/${model_slug})`,
  ]

  if (provider_tag_slug) {
    links.push(`[🔀 Provider](https://openrouter.ai/provider/${provider_tag_slug})`)
  }

  if (hugging_face_id) {
    links.push(`[🤗 HuggingFace](https://huggingface.co/${hugging_face_id})`)
  }

  return links.join(DOT_SPACER)
}

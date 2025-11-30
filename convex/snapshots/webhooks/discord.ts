import type { Doc } from '../../_generated/dataModel'

type Change = Doc<'or_views_changes'>

// * Discord embed color codes
const COLORS = {
  create: 0x22c55e, // green
  update: 0x3b82f6, // blue
  delete: 0xef4444, // red
} as const

// * Emoji prefixes for change kinds
const EMOJI = {
  create: '🆕',
  update: '🔄',
  delete: '🗑️',
} as const

export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '`null`'
  if (typeof value === 'number')
    return value.toLocaleString(undefined, { maximumFractionDigits: 20 })
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

function formatChangeValue(change: Change): string {
  const before = formatValue(change.before)
  const after = formatValue(change.after)

  if (change.change_kind === 'create') {
    return `→ ${after}`
  }
  if (change.change_kind === 'delete') {
    return `${before} →`
  }
  return `${before} → ${after}`
}

function getEntityLabel(change: Change): string {
  if (change.entity_type === 'endpoint') {
    return `${change.model_slug} (${change.provider_tag_slug})`
  }
  if (change.entity_type === 'model') {
    return change.model_slug
  }
  return change.provider_slug
}

export type DiscordEmbed = {
  title: string
  description?: string
  color: number
  fields?: Array<{ name: string; value: string; inline?: boolean }>
  footer?: { text: string }
  timestamp?: string
}

export type DiscordWebhookPayload = {
  content?: string
  embeds: DiscordEmbed[]
}

// * format a single change as a Discord embed field
export function formatChangeField(change: Change): { name: string; value: string } {
  const path = change.path ?? 'unknown'
  return {
    name: path,
    value: formatChangeValue(change),
  }
}

// * format a group of changes for the same entity into an embed
export function formatEntityEmbed(entityKey: string, changes: Change[]): DiscordEmbed {
  const first = changes[0]
  if (!first) throw new Error('No changes to format')

  const changeKind = first.change_kind
  const emoji = EMOJI[changeKind]
  const color = COLORS[changeKind]

  // * create/delete are entity-level events - show description only
  if (changeKind === 'create' || changeKind === 'delete') {
    const action = changeKind === 'create' ? 'Created' : 'Deleted'
    return {
      title: `${emoji} ${getEntityLabel(first)}`,
      description: `${first.entity_type} ${action.toLowerCase()}`,
      color,
    }
  }

  // * update events have field-level changes
  const fields = changes.map(formatChangeField)

  return {
    title: `${emoji} ${getEntityLabel(first)}`,
    color,
    fields: fields.slice(0, 25), // Discord limit
  }
}

// * group changes by entity and format as embeds
export function formatChangesAsEmbeds(changes: Change[]): DiscordEmbed[] {
  // * group by entity key
  const byEntity = new Map<string, Change[]>()

  for (const change of changes) {
    const key =
      change.entity_type === 'endpoint'
        ? `endpoint:${change.endpoint_uuid}`
        : change.entity_type === 'model'
          ? `model:${change.model_slug}`
          : `provider:${change.provider_slug}`

    const existing = byEntity.get(key) ?? []
    existing.push(change)
    byEntity.set(key, existing)
  }

  // * format each entity group as an embed
  const embeds: DiscordEmbed[] = []
  for (const [key, entityChanges] of byEntity) {
    embeds.push(formatEntityEmbed(key, entityChanges))
  }

  return embeds
}

// * format a batch of changes as a Discord webhook payload
export function formatWebhookPayload(changes: Change[], crawl_id: string): DiscordWebhookPayload {
  const embeds = formatChangesAsEmbeds(changes)

  // * Discord allows max 10 embeds per message
  const truncatedEmbeds = embeds.slice(0, 10)

  // * add footer to last embed with crawl info
  const lastEmbed = truncatedEmbeds[truncatedEmbeds.length - 1]
  if (lastEmbed) {
    const crawlDate = new Date(parseInt(crawl_id))
    lastEmbed.footer = { text: `ORCA • ${crawl_id}` }
    lastEmbed.timestamp = crawlDate.toISOString()
  }

  const content = embeds.length > 10 ? `Showing 10 of ${embeds.length} changed entities` : undefined

  return {
    content,
    embeds: truncatedEmbeds,
  }
}

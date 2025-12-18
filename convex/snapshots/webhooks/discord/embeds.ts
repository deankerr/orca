import * as R from 'remeda'

import { APIEmbed, RESTPostAPIWebhookWithTokenJSONBody } from 'discord-api-types/v10'

import { formatPricing } from '../../../shared/pricing'
import { transformEndpoint } from '../../../transforms/endpoint'
import type { WebhookChange } from '../inputs'
import { buildEndpointCreateEmbed } from './endpointCreate'
import { buildModelCreateEmbed } from './modelCreate'
import { buildLinks, getColorIconUrl } from './utils'

// https://discord.com/developers/docs/resources/message#embed-object-embed-structure

/*
  improvements:
  - build lines with composition array
  - combine emoji+label function
*/

export type { APIEmbed }
export type DiscordPayload = RESTPostAPIWebhookWithTokenJSONBody

// * Discord limits
const MAX_EMBEDS_PER_MESSAGE = 10

// * Value formatting

const MIN_FIELD_WIDTH = 16
const MIN_VALUE_WIDTH = 12

function monoField(
  value: string,
  args: { align?: 'left' | 'center' | 'right'; minWidth?: number } = {},
): string {
  const { align = 'left', minWidth = 0 } = args

  const paddingNeeded = Math.max(0, minWidth - value.length)

  let leftPad = 0
  let rightPad = 0

  if (align === 'left') {
    // all padding on right
    rightPad = paddingNeeded
  } else if (align === 'center') {
    // split padding, extra on right when odd
    leftPad = Math.floor(paddingNeeded / 2)
    rightPad = paddingNeeded - leftPad
  } else if (align === 'right') {
    // all padding on left
    leftPad = paddingNeeded
  }

  const padded = ' '.repeat(leftPad) + value + ' '.repeat(rightPad)
  return `\` ${padded} \``
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number')
    return value.toLocaleString(undefined, { maximumFractionDigits: 20 })
  if (typeof value === 'string') return value.length > 100 ? value.slice(0, 100) + '…' : value
  return JSON.stringify(value)
}

function formatPricingValue(value: unknown, priceKey: string): string {
  if (typeof value === 'string' || typeof value === 'number') {
    const formatted = formatPricing(priceKey, value)
    if (formatted) return `${formatted.value} ${formatted.unit}`
  }
  return formatValue(value)
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = parseFloat(value)
    return isNaN(parsed) ? null : parsed
  }
  return null
}

function getChangeEmoji(path: string): string {
  // * exact matches
  const exact: Record<string, string> = {
    // model fields
    name: '🏷️',
    reasoning: '🧠',
    tokenizer: '✂️',
    instruct_type: '📋',
    hugging_face_id: '🤗',
    promotion_message: '📢',
    warning_message: '⚠️',

    // endpoint fields
    context_length: '📏',
    quantization: '📊',
    completions: '🔘',
    chat_completions: '💬',
    deranked: '🤡',
    implicit_caching: '💾',
    moderated: '🛡️',
    native_web_search: '🌐',
  }
  if (exact[path]) return exact[path]

  // * prefix matches
  if (path.startsWith('input_modalities')) return '🎭'
  if (path.startsWith('output_modalities')) return '🎭'
  if (path.startsWith('data_policy')) return '🔍'
  if (path.startsWith('limits')) return '🛑'
  if (path.startsWith('provider')) return '🌍'

  // * fallback
  return '⚙️'
}

function formatChangeTemplate(
  emoji: string,
  label: string,
  before: string,
  after: string,
  delta: string,
): string {
  return [
    emoji,
    monoField(label, { align: 'center', minWidth: MIN_FIELD_WIDTH }),
    monoField(before, { align: 'center', minWidth: MIN_VALUE_WIDTH }),
    '▶︎',
    monoField(after, { align: 'center', minWidth: MIN_VALUE_WIDTH }),
    delta,
  ].join(' ')
}

// * array diff: show added/removed items
function formatArrayDiff(path: string, label: string, before: unknown[], after: unknown[]): string {
  const beforeSet = new Set(before.map(String))
  const afterSet = new Set(after.map(String))

  const added = after.filter((item) => !beforeSet.has(String(item))).map(String)
  const removed = before.filter((item) => !afterSet.has(String(item))).map(String)

  const emoji = getChangeEmoji(path)
  const parts: string[] = [emoji, monoField(label, { align: 'left', minWidth: MIN_FIELD_WIDTH })]

  // * build code diff block
  const diffLines: string[] = []
  if (removed.length > 0) {
    for (const item of removed) {
      diffLines.push(`- ${item}`)
    }
  }
  if (added.length > 0) {
    for (const item of added) {
      diffLines.push(`+ ${item}`)
    }
  }

  if (diffLines.length > 0) {
    parts.push(`\`\`\`diff\n${diffLines.join('\n')}\n\`\`\``)
  }

  return parts.join(' ')
}

function formatUpdateChange(change: WebhookChange): string {
  const path = change.path ?? 'unknown'
  const field = change.path_level_2 ?? change.path_level_1 ?? 'unknown'
  const isPricing = change.path_level_1 === 'pricing'
  const isPricingTiers = isPricing && change.path_level_2 === 'tiers'

  // * array diffs (skip pricing.tiers - too complex)
  if (Array.isArray(change.before) && Array.isArray(change.after) && !isPricingTiers) {
    return formatArrayDiff(path, field, change.before, change.after)
  }

  // * pricing changes get special formatting
  if (isPricing) {
    const beforeNum = toNumber(change.before)
    const afterNum = toNumber(change.after)
    const beforeFormatted = formatPricingValue(change.before, field)
    const afterFormatted = formatPricingValue(change.after, field)

    let delta: string
    if (beforeNum === null || afterNum === null || beforeNum === 0) {
      delta = ''
    } else {
      const percentChange = ((afterNum - beforeNum) / beforeNum) * 100
      const arrow = percentChange > 0 ? '⬆︎' : '⬇︎'
      delta = `${arrow}${Math.abs(percentChange).toFixed(0)}%`
    }

    return formatChangeTemplate('💵', field, beforeFormatted, afterFormatted, delta)
  }

  // * all other changes
  const emoji = getChangeEmoji(path)
  return formatChangeTemplate(
    emoji,
    field,
    formatValue(change.before),
    formatValue(change.after),
    '',
  )
}

// * Format changes into Discord embeds (one embed per model)

export function generateDiscordEmbeds(changes: WebhookChange[]) {
  const crawl_id = R.first(changes)?.crawl_id
  if (!crawl_id) return []

  const changesByModel = Map.groupBy(changes, (c) => c.model_slug)

  const embeds: APIEmbed[] = []
  for (const [model_slug, entityChanges] of changesByModel) {
    const modelChanges = entityChanges.filter((c) => c.entity_type === 'model')

    // * model created - use new discord.js builder (standalone embed)
    const modelCreateChange = modelChanges.find(
      (c): c is WebhookChange & { entity_type: 'model'; change_kind: 'create' } =>
        c.change_kind === 'create',
    )
    if (modelCreateChange) {
      const embed = buildModelCreateEmbed({
        change: modelCreateChange,
      })
      embeds.push(embed.toJSON())
      continue // model create is standalone, skip other changes for this model
    }

    // * individual endpoint create embeds
    const endpointCreateChanges = entityChanges.filter(
      (c) => c.entity_type === 'endpoint' && c.change_kind === 'create',
    )
    for (const change of endpointCreateChanges) {
      if ('endpoint' in change && change.endpoint) {
        const embed = buildEndpointCreateEmbed({
          model_slug: change.model_slug,
          endpoint_uuid: change.endpoint_uuid,
          endpoint: transformEndpoint(change.endpoint),
        })
          .setFooter({
            text: `ORCA ${change.crawl_id}`,
          })
          .setTimestamp(new Date(parseInt(change.crawl_id)))

        embeds.push(embed.toJSON())
      }
    }

    // * existing system for updates/deletes
    const items: string[] = []

    // * other endpoint changes
    const endpointChanges = entityChanges
      .filter((c) => c.entity_type === 'endpoint')
      .filter((c) => c.change_kind !== 'create')

    // * model updates (bulleted)
    const modelUpdates = modelChanges.filter((c) => c.change_kind === 'update')
    if (modelUpdates.length > 0) {
      const bullets = modelUpdates.map((c) => `${formatUpdateChange(c)}`)
      items.push(bullets.join('\n'))
    }

    // * endpoints grouped by provider (each provider is one block)
    const endpointChangesByProvider = Map.groupBy(endpointChanges, (c) => c.provider_tag_slug)
    for (const [providerSlug, providerChanges] of endpointChangesByProvider) {
      const lines: string[] = [`${providerSlug}`]

      // * endpoint updates
      for (const change of providerChanges.filter((c) => c.change_kind === 'update')) {
        lines.push(`${formatUpdateChange(change)}`)
      }

      // * endpoint deleted
      if (providerChanges.find((c) => c.change_kind === 'delete')) {
        lines.push('❌ endpoint deleted')
      }

      items.push(lines.join('\n'))
    }

    // * model deleted
    if (modelChanges.find((c) => c.change_kind === 'delete')) {
      items.push('☠️ model deleted')
    }

    if (items.length === 0) continue

    // * get hugging_face_id from first model change if available
    const hugging_face_id = modelChanges[0]?.model?.hugging_face_id
    const links = buildLinks(model_slug, hugging_face_id)

    const embed: APIEmbed = {
      author: {
        name: model_slug,
        icon_url: getColorIconUrl(model_slug),
      },
      description: `${items.join('\n\n')}\n\n${links}`,
      footer: { text: `ORCA • ${crawl_id}` },
      timestamp: new Date(parseInt(crawl_id)).toISOString(),
      color: 0x3b82f6,
    }
    embeds.push(embed)
  }

  return R.chunk(embeds, MAX_EMBEDS_PER_MESSAGE)
}

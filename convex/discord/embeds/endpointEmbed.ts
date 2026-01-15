import { EmbedBuilder } from '@discordjs/builders'

import type { EndpointChange } from '../../alerts/inputs'
import { formatPricing } from '../../shared/pricing'
import { COLORS, EMOJIS } from '../constants'
import {
  buildEntityLinks,
  formatArrayDiff,
  formatDelta,
  formatValue,
  getColorIconUrl,
  getFieldLabel,
  isMissing,
  mono,
  toNumber,
  type EmbedResult,
} from './utils'

function formatPricingValue(value: unknown, priceKey: string): string {
  if (typeof value === 'string' || typeof value === 'number') {
    const formatted = formatPricing(priceKey, value)
    if (formatted) return `${formatted.value} /${formatted.unit}`
  }
  return ''
}

const PRICING_FIELDS = [
  'text_input',
  'text_output',
  'text_cache_read',
  'text_cache_write',
  'reasoning_output',
  'audio_input',
  'audio_cache_write',
  'image_input',
  'image_output',
  'per_request',
] as const

function buildEndpointFields(change: EndpointChange) {
  const { endpoint_uuid, endpoint, provider_tag_slug } = change
  const fields: { name: string; value: string; inline: boolean }[] = []

  // Standard header: provider_id
  fields.push({
    name: 'provider_id',
    value: mono(endpoint?.provider_id ?? provider_tag_slug ?? 'unknown'),
    inline: false,
  })

  // Show full context if endpoint data is available
  if (endpoint) {
    fields.push({
      name: 'context_length',
      value: mono(endpoint.context_length.toLocaleString()),
      inline: true,
    })

    fields.push({
      name: 'max_output',
      value: mono((endpoint.limits.text_output_tokens ?? endpoint.context_length).toLocaleString()),
      inline: true,
    })

    fields.push({
      name: 'quantization',
      value: mono(endpoint.quantization),
      inline: true,
    })

    fields.push({
      name: 'tools',
      value: endpoint.supported_parameters.includes('tools') ? EMOJIS.checkmark : EMOJIS.cross,
      inline: true,
    })

    fields.push({
      name: 'json_object',
      value: endpoint.supported_parameters.includes('response_format')
        ? EMOJIS.checkmark
        : EMOJIS.cross,
      inline: true,
    })

    fields.push({
      name: 'json_schema',
      value: endpoint.supported_parameters.includes('structured_outputs')
        ? EMOJIS.checkmark
        : EMOJIS.cross,
      inline: true,
    })

    for (const key of PRICING_FIELDS) {
      const value = endpoint.pricing[key]
      if (value !== null) {
        const formatted = formatPricingValue(value, key)
        if (formatted) {
          fields.push({ name: key, value: mono(formatted), inline: true })
        }
      }
    }
  }

  // Standard footer: uuid
  fields.push({
    name: 'endpoint_uuid',
    value: mono(endpoint_uuid),
    inline: false,
  })

  return fields
}

function buildBaseEmbed(change: EndpointChange): EmbedResult {
  const { model_slug, endpoint, provider_tag_slug, model, change_kind, crawl_id } = change
  const provider_name = endpoint?.provider_name ?? provider_tag_slug ?? 'Unknown'
  const provider_id = endpoint?.provider_id ?? provider_tag_slug

  const embed = new EmbedBuilder()
    .setColor(COLORS[change_kind])
    .setTimestamp(new Date(parseInt(crawl_id)))
    .setAuthor({
      name: model_slug,
      iconURL: getColorIconUrl(model_slug),
    })
    .setThumbnail(getColorIconUrl(provider_id ?? model_slug) ?? null)

  // Set title based on change kind
  if (change_kind === 'create') {
    embed.setTitle(`${provider_name} ${EMOJIS.new}`)
  } else {
    embed.setTitle(`~~${provider_name}~~ ${EMOJIS.delete}`)
  }

  const fields = buildEndpointFields(change)
  embed.setFields(fields)

  const links = buildEntityLinks({
    model_slug,
    hugging_face_id: model?.hugging_face_id,
    provider_tag_slug: provider_id,
  })
  embed.addFields({ name: 'links', value: links, inline: false })

  return embed.toJSON()
}

function buildUpdateEmbed(changes: EndpointChange[]): EmbedResult {
  const first = changes[0]!
  const { model_slug, endpoint_uuid, endpoint, provider_tag_slug, model, crawl_id } = first
  const provider_name = endpoint?.provider_name ?? provider_tag_slug ?? 'Unknown'
  const provider_id = endpoint?.provider_id ?? provider_tag_slug

  const embed = new EmbedBuilder()
    .setColor(COLORS.update)
    .setTimestamp(new Date(parseInt(crawl_id)))
    .setAuthor({
      name: model_slug,
      iconURL: getColorIconUrl(model_slug),
    })
    .setTitle(provider_name)
    .setThumbnail(getColorIconUrl(provider_id ?? model_slug) ?? null)

  const fields: { name: string; value: string; inline: boolean }[] = []

  // Standard header: provider_id
  if (provider_id) {
    fields.push({
      name: 'provider_id',
      value: mono(provider_id),
      inline: false,
    })
  }

  // Field changes from all update records
  const fieldChanges = changes.filter((c) => c.change_kind === 'update')

  for (const change of fieldChanges) {
    const field = change.path_level_2 ?? change.path_level_1 ?? 'unknown'
    const label = getFieldLabel(field, change.before, change.after)
    const isNew = isMissing(change.before)
    const isRemoved = isMissing(change.after)

    const isPricing = change.path_level_1 === 'pricing'
    const isPricingTiers = isPricing && change.path_level_2 === 'tiers'

    // Array diffs (skip pricing tiers - too complex)
    if (Array.isArray(change.before) && Array.isArray(change.after) && !isPricingTiers) {
      const diff = formatArrayDiff(change.before, change.after)
      if (diff) {
        fields.push({
          name: label,
          value: diff,
          inline: false,
        })
      }
      continue
    }

    // Pricing changes
    if (isPricing && !isPricingTiers) {
      const beforeNum = toNumber(change.before)
      const afterNum = toNumber(change.after)
      const beforeFormatted = formatPricingValue(change.before, field)
      const afterFormatted = formatPricingValue(change.after, field)
      const delta = formatDelta(beforeNum, afterNum)

      let value: string
      if (isNew) {
        value = mono(afterFormatted)
      } else if (isRemoved) {
        value = mono(beforeFormatted)
      } else {
        value = `${mono(beforeFormatted)} ${EMOJIS.arrow} ${mono(afterFormatted)} ${delta}`.trim()
      }

      fields.push({ name: label, value, inline: false })
      continue
    }

    // Numeric fields with delta (detect by checking actual types)
    const isNumeric =
      (typeof change.before === 'number' || isMissing(change.before)) &&
      (typeof change.after === 'number' || isMissing(change.after)) &&
      !(isMissing(change.before) && isMissing(change.after))

    if (isNumeric) {
      const beforeNum = toNumber(change.before)
      const afterNum = toNumber(change.after)
      const delta = formatDelta(beforeNum, afterNum)
      const beforeStr = formatValue(change.before)
      const afterStr = formatValue(change.after)

      let value: string
      if (isNew) {
        value = afterStr
      } else if (isRemoved) {
        value = beforeStr
      } else {
        value = `${beforeStr} ${EMOJIS.arrow} ${afterStr} ${delta}`.trim()
      }

      fields.push({ name: label, value, inline: false })
      continue
    }

    // Simple value changes
    const beforeStr = formatValue(change.before)
    const afterStr = formatValue(change.after)

    let value: string
    if (isNew) {
      value = afterStr
    } else if (isRemoved) {
      value = beforeStr
    } else {
      value = `${beforeStr} ${EMOJIS.arrow} ${afterStr}`
    }

    fields.push({ name: label, value, inline: false })
  }

  // Standard footer: uuid
  fields.push({
    name: 'endpoint_uuid',
    value: mono(endpoint_uuid),
    inline: false,
  })

  embed.setFields(fields)

  const links = buildEntityLinks({
    model_slug,
    hugging_face_id: model?.hugging_face_id,
    provider_tag_slug: provider_id,
  })
  embed.addFields({ name: 'links', value: links, inline: false })

  return embed.toJSON()
}

export function buildEndpointEmbed(changes: EndpointChange[]): EmbedResult {
  const first = changes[0]
  if (!first) throw new Error('buildEndpointEmbed requires at least one change')

  // Updates show field-level diffs, create/delete show full endpoint state
  if (first.change_kind === 'update') {
    return buildUpdateEmbed(changes)
  }

  return buildBaseEmbed(first)
}

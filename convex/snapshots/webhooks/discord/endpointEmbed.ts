import { EmbedBuilder } from '@discordjs/builders'

import { formatPricing } from '../../../shared/pricing'
import type { OrcaEndpoint } from '../../../transforms/endpoint'
import { buildEntityLinks } from './components'
import {
  COLORS,
  EMOJIS,
  formatArrayDiff,
  formatDelta,
  formatValue,
  getColorIconUrl,
  getFieldLabel,
  isMissing,
  mono,
  toNumber,
  type EmbedResult,
  type FieldChange,
} from './utils'

function formatPricingValue(value: unknown, priceKey: string): string {
  if (typeof value === 'string' || typeof value === 'number') {
    const formatted = formatPricing(priceKey, value)
    if (formatted) return `${formatted.value} /${formatted.unit}`
  }
  return ''
}

// Core pricing fields (always shown if present)
const CORE_PRICING_FIELDS: Array<keyof OrcaEndpoint['pricing']> = [
  'text_input',
  'text_output',
  'text_cache_read',
  'text_cache_write',
]

// Optional pricing fields (only shown if they have values)
const OPTIONAL_PRICING_FIELDS: Array<keyof OrcaEndpoint['pricing']> = [
  'reasoning_output',
  'audio_input',
  'audio_cache_write',
  'image_input',
  'image_output',
  'per_request',
]

function buildEndpointFields(
  model_slug: string,
  endpoint_uuid: string,
  endpoint: OrcaEndpoint | null,
  provider_tag_slug: string | undefined,
) {
  const isFree = model_slug.split(':')[1] === 'free'
  const fields: { name: string; value: string; inline: boolean }[] = []

  // Standard header: provider_id
  fields.push({
    name: 'provider_id',
    value: mono(provider_tag_slug ?? endpoint?.provider_id ?? 'unknown'),
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

    for (const key of CORE_PRICING_FIELDS) {
      const value = endpoint.pricing[key]
      if (value !== undefined && value !== null) {
        if (isFree && (key === 'text_input' || key === 'text_output')) {
          fields.push({ name: key, value: '\ud83c\udd93', inline: true })
        } else {
          const formatted = formatPricingValue(value, key)
          if (formatted) {
            fields.push({ name: key, value: mono(formatted), inline: true })
          }
        }
      }
    }

    for (const key of OPTIONAL_PRICING_FIELDS) {
      const value = endpoint.pricing[key]
      if (value !== undefined && value !== null) {
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

function buildBaseEmbed(
  model_slug: string,
  endpoint_uuid: string,
  endpoint: OrcaEndpoint | null,
  provider_name: string,
  provider_tag_slug: string | undefined,
  change_kind: 'create' | 'delete',
  hugging_face_id?: string,
): EmbedResult {
  const embed = new EmbedBuilder()
    .setColor(COLORS[change_kind])
    .setAuthor({
      name: model_slug,
      iconURL: getColorIconUrl(model_slug),
    })
    .setThumbnail(getColorIconUrl(provider_tag_slug ?? endpoint?.provider_id ?? model_slug) ?? null)

  // Set title based on change kind
  if (change_kind === 'create') {
    embed.setTitle(`${provider_name} ${EMOJIS.new}`)
  } else {
    embed.setTitle(`~~${provider_name}~~ ${EMOJIS.delete}`)
  }

  const fields = buildEndpointFields(model_slug, endpoint_uuid, endpoint, provider_tag_slug)
  embed.setFields(fields)

  const links = buildEntityLinks({
    model_slug,
    hugging_face_id,
    provider_tag_slug: provider_tag_slug ?? endpoint?.provider_id,
  })

  return { embed: embed.toJSON(), links }
}

function buildUpdateEmbed(
  model_slug: string,
  endpoint_uuid: string,
  provider_name: string,
  provider_tag_slug: string | undefined,
  changes: FieldChange[],
  hugging_face_id?: string,
): EmbedResult {
  const embed = new EmbedBuilder()
    .setColor(COLORS.update)
    .setAuthor({
      name: model_slug,
      iconURL: getColorIconUrl(model_slug),
    })
    .setTitle(provider_name)
    .setThumbnail(getColorIconUrl(provider_tag_slug ?? model_slug) ?? null)

  const fields: { name: string; value: string; inline: boolean }[] = []

  // Standard header: provider_id
  if (provider_tag_slug) {
    fields.push({
      name: 'provider_id',
      value: mono(provider_tag_slug),
      inline: false,
    })
  }

  for (const change of changes) {
    const field = change.path_level_2 ?? change.path_level_1 ?? 'unknown'
    const isPricing = change.path_level_1 === 'pricing'
    const isPricingTiers = isPricing && change.path_level_2 === 'tiers'

    // Array diffs (skip pricing tiers - too complex)
    if (Array.isArray(change.before) && Array.isArray(change.after) && !isPricingTiers) {
      const diff = formatArrayDiff(change.before, change.after)
      if (diff) {
        fields.push({
          name: field,
          value: diff,
          inline: false,
        })
      }
      continue
    }

    const label = getFieldLabel(field, change.before, change.after)
    const isNew = isMissing(change.before)
    const isRemoved = isMissing(change.after)

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
        value = mono(afterStr)
      } else if (isRemoved) {
        value = mono(beforeStr)
      } else {
        value = `${mono(beforeStr)} ${EMOJIS.arrow} ${mono(afterStr)} ${delta}`.trim()
      }

      fields.push({ name: label, value, inline: false })
      continue
    }

    // Simple value changes
    const beforeStr = formatValue(change.before)
    const afterStr = formatValue(change.after)

    let value: string
    if (isNew) {
      value = mono(afterStr)
    } else if (isRemoved) {
      value = mono(beforeStr)
    } else {
      value = `${mono(beforeStr)} ${EMOJIS.arrow} ${mono(afterStr)}`
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
    hugging_face_id,
    provider_tag_slug,
  })

  return { embed: embed.toJSON(), links }
}

export function buildEndpointEmbed(args: {
  model_slug: string
  endpoint_uuid: string
  change_kind: 'create' | 'update' | 'delete'
  endpoint: OrcaEndpoint | null
  provider_name: string
  provider_tag_slug?: string
  hugging_face_id?: string
  changes?: FieldChange[]
}): EmbedResult {
  const {
    model_slug,
    endpoint_uuid,
    change_kind,
    endpoint,
    provider_name,
    provider_tag_slug,
    hugging_face_id,
    changes = [],
  } = args

  // Updates show field-level diffs, create/delete show full endpoint state
  if (change_kind === 'update') {
    return buildUpdateEmbed(
      model_slug,
      endpoint_uuid,
      provider_name,
      provider_tag_slug,
      changes,
      hugging_face_id,
    )
  }

  return buildBaseEmbed(
    model_slug,
    endpoint_uuid,
    endpoint,
    provider_name,
    provider_tag_slug,
    change_kind,
    hugging_face_id,
  )
}

import { EmbedBuilder } from '@discordjs/builders'

import { formatPricing } from '../../../shared/pricing'
import { OrcaEndpoint } from '../../../transforms/endpoint'
import { getColorIconUrl, mono } from './utils'

function formatPricingValue(value: unknown, priceKey: string): string {
  if (typeof value === 'string' || typeof value === 'number') {
    const formatted = formatPricing(priceKey, value)
    if (formatted) return `${formatted.value} /${formatted.unit}`
  }
  return ''
}

export function buildEndpointCreateEmbed(args: {
  model_slug: string
  endpoint_uuid: string
  endpoint: OrcaEndpoint
}): EmbedBuilder {
  const { model_slug, endpoint_uuid, endpoint } = args

  const embed = new EmbedBuilder()
    .setColor(0x22c55e) // green for new endpoint
    .setAuthor({
      name: model_slug,
      iconURL: getColorIconUrl(model_slug),
    })
    .setTitle(`${endpoint.provider_name}`)
    .setThumbnail(getColorIconUrl(endpoint.provider_id) ?? null)

  // * fields
  const fields: { name: string; value: string; inline: boolean }[] = []

  fields.push({
    name: 'provider_id',
    value: mono(endpoint.provider_id),
    inline: false,
  })

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
    value: endpoint.supported_parameters.includes('tools') ? '✅' : '❌',
    inline: true,
  })

  fields.push({
    name: 'json_object',
    value: endpoint.supported_parameters.includes('response_format') ? '✅' : '❌',
    inline: true,
  })

  fields.push({
    name: 'json_schema',
    value: endpoint.supported_parameters.includes('structured_outputs') ? '✅' : '❌',
    inline: true,
  })

  // * text_input/text_output get a special emoji for free tiers
  const isFree = model_slug.split(':')[1] === 'free'

  if (endpoint.pricing.text_input) {
    fields.push({
      name: 'text_input',
      value: isFree ? '🆓' : mono(formatPricingValue(endpoint.pricing.text_input, 'text_input')),
      inline: true,
    })
  }

  if (endpoint.pricing.text_output) {
    fields.push({
      name: 'text_output',
      value: isFree ? '🆓' : mono(formatPricingValue(endpoint.pricing.text_output, 'text_output')),
      inline: true,
    })
  }

  if (endpoint.pricing.text_cache_read) {
    fields.push({
      name: 'text_cache_read',
      value: mono(formatPricingValue(endpoint.pricing.text_cache_read, 'text_cache_read')),
      inline: true,
    })
  }

  if (endpoint.pricing.text_cache_write) {
    fields.push({
      name: 'text_cache_write',
      value: mono(formatPricingValue(endpoint.pricing.text_cache_write, 'text_cache_write')),
      inline: true,
    })
  }

  if (endpoint.pricing.reasoning_output) {
    fields.push({
      name: 'reasoning_output',
      value: mono(formatPricingValue(endpoint.pricing.reasoning_output, 'reasoning_output')),
      inline: true,
    })
  }

  if (endpoint.pricing.audio_input) {
    fields.push({
      name: 'audio_input',
      value: mono(formatPricingValue(endpoint.pricing.audio_input, 'audio_input')),
      inline: true,
    })
  }

  if (endpoint.pricing.audio_cache_write) {
    fields.push({
      name: 'audio_cache_write',
      value: mono(formatPricingValue(endpoint.pricing.audio_cache_write, 'audio_cache_write')),
      inline: true,
    })
  }

  if (endpoint.pricing.image_input) {
    fields.push({
      name: 'image_input',
      value: mono(formatPricingValue(endpoint.pricing.image_input, 'image_input')),
      inline: true,
    })
  }

  if (endpoint.pricing.image_output) {
    fields.push({
      name: 'image_output',
      value: mono(formatPricingValue(endpoint.pricing.image_output, 'image_output')),
      inline: true,
    })
  }

  if (endpoint.pricing.per_request) {
    fields.push({
      name: 'per_request',
      value: mono(formatPricingValue(endpoint.pricing.per_request, 'per_request')),
      inline: true,
    })
  }

  fields.push({
    name: 'uuid',
    value: mono(endpoint_uuid),
    inline: false,
  })

  embed.setFields(fields)

  return embed
}

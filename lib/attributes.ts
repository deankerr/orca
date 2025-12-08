import type { VariantProps } from 'class-variance-authority'

import { Doc } from '@/convex/_generated/dataModel'

import { RadIconBadge } from '@/components/shared/rad-badge'
import { SpriteIconName } from '@/lib/sprite-icons'

import { formatDateTime, formatPrice } from './formatters'

type EndpointPartial = Partial<Doc<'or_views_endpoints'>>
type Color = VariantProps<typeof RadIconBadge>['color']

export interface Attribute {
  key: string
  icon: SpriteIconName
  label: string
  description: string
  color: Color
  resolve: (endpoint: EndpointPartial) => {
    active: boolean
    value?: string
    details?: { label?: string; value: string }[]
  }
}

export const attributes: Record<string, Attribute> = {
  // Features (model)
  reasoning: {
    key: 'reasoning',
    icon: 'brain-cog',
    label: 'Reasoning',
    description: 'Model supports reasoning capabilities',
    color: 'indigo',
    resolve: (endpoint) => {
      const active = endpoint.model?.reasoning ?? false
      const items = []

      if (endpoint.pricing?.internal_reasoning) {
        items.push({
          label: 'Internal Reasoning',
          value: formatPrice({
            priceKey: 'internal_reasoning',
            priceValue: endpoint.pricing.internal_reasoning,
          }),
        })
      }

      return {
        active,
        details: items.length > 0 ? items : undefined,
      }
    },
  },

  mandatory_reasoning: {
    key: 'mandatory_reasoning',
    icon: 'brain-cog',
    label: 'Mandatory Reasoning',
    description: 'Reasoning cannot be disabled.',
    color: 'indigo',
    resolve: (endpoint) => {
      const active = endpoint.mandatory_reasoning ?? false
      const items = []

      if (endpoint.pricing?.internal_reasoning) {
        items.push({
          label: 'Internal Reasoning',
          value: formatPrice({
            priceKey: 'internal_reasoning',
            priceValue: endpoint.pricing.internal_reasoning,
          }),
        })
      }

      return {
        active,
        details: items.length > 0 ? items : undefined,
      }
    },
  },

  tools: {
    key: 'tools',
    icon: 'wrench',
    label: 'Tools',
    description: 'Supports tool parameters',
    color: 'blue',
    resolve: (endpoint) => ({
      active: endpoint.supported_parameters?.includes('tools') ?? false,
    }),
  },

  response_format: {
    key: 'response_format',
    icon: 'braces',
    label: 'Response Format',
    description: 'Supports the response_format parameter with json_object type',
    color: 'teal',
    resolve: (endpoint) => ({
      active: endpoint.supported_parameters?.includes('response_format') ?? false,
    }),
  },

  structured_outputs: {
    key: 'structured_outputs',
    icon: 'braces',
    label: 'Structured Outputs',
    description: 'Supports the response_format parameter with json_schema type',
    color: 'teal',
    resolve: (endpoint) => ({
      active: endpoint.supported_parameters?.includes('structured_outputs') ?? false,
    }),
  },

  caching: {
    key: 'caching',
    icon: 'database',
    label: 'Caching',
    description: 'Inputs can be cached',
    color: 'cyan',
    resolve: (endpoint) => {
      const active = !!endpoint.pricing?.cache_read
      const items = []

      if (endpoint.pricing?.cache_read) {
        items.push({
          label: 'Read',
          value: formatPrice({
            priceKey: 'cache_read',
            priceValue: endpoint.pricing.cache_read,
          }),
        })
      }

      if (endpoint.pricing?.cache_write) {
        items.push({
          label: 'Write',
          value: formatPrice({
            priceKey: 'cache_write',
            priceValue: endpoint.pricing.cache_write,
          }),
        })
      }

      return {
        active,
        details: items.length > 0 ? items : undefined,
      }
    },
  },

  implicit_caching: {
    key: 'implicit_caching',
    icon: 'database',
    label: 'Implicit Caching',
    description: 'Inputs are cached automatically',
    color: 'cyan',
    resolve: (endpoint) => {
      const active = endpoint.implicit_caching ?? false
      const items = []

      if (endpoint.pricing?.cache_read) {
        items.push({
          label: 'Read',
          value: formatPrice({
            priceKey: 'cache_read',
            priceValue: endpoint.pricing.cache_read,
          }),
        })
      }

      if (endpoint.pricing?.cache_write) {
        items.push({
          label: 'Write',
          value: formatPrice({
            priceKey: 'cache_write',
            priceValue: endpoint.pricing.cache_write,
          }),
        })
      }

      return {
        active,
        details: items.length > 0 ? items : undefined,
      }
    },
  },

  // Features (OpenRouter)
  moderated: {
    key: 'moderated',
    icon: 'shield-alert',
    label: 'Moderated',
    description: 'Content is moderated by OpenRouter before being sent to the provider.',
    color: 'amber',
    resolve: (endpoint) => ({
      active: endpoint.moderated ?? false,
    }),
  },

  // Other features
  file_urls: {
    key: 'file_urls',
    icon: 'link',
    label: 'File URLs',
    description: 'Supports file URL inputs',
    color: 'purple',
    resolve: (endpoint) => ({
      active: endpoint.file_urls ?? false,
    }),
  },

  native_web_search: {
    key: 'native_web_search',
    icon: 'globe',
    label: 'Native Web Search',
    description: 'Use native web search capabilities',
    color: 'emerald',
    resolve: (endpoint) => {
      const active = endpoint.native_web_search ?? false
      const items = []

      if (endpoint.pricing?.web_search) {
        items.push({
          label: 'Per Request',
          value: formatPrice({
            priceKey: 'web_search',
            priceValue: endpoint.pricing.web_search,
          }),
        })
      }

      return {
        active,
        details: items.length > 0 ? items : undefined,
      }
    },
  },

  completions: {
    key: 'completions',
    icon: 'message-square',
    label: 'Completions',
    description: 'Supports text completion API',
    color: 'blue',
    resolve: (endpoint) => ({
      active: endpoint.completions ?? false,
    }),
  },

  chat_completions: {
    key: 'chat_completions',
    icon: 'messages-square',
    label: 'Chat Completions',
    description: 'Supports chat completion API',
    color: 'blue',
    resolve: (endpoint) => ({
      active: endpoint.chat_completions ?? false,
    }),
  },

  stream_cancellation: {
    key: 'stream_cancellation',
    icon: 'square-stop',
    label: 'Stream Cancellation',
    description: 'Supports streaming cancellation',
    color: 'gray',
    resolve: (endpoint) => ({
      active: endpoint.stream_cancellation ?? false,
    }),
  },

  // Variant
  free: {
    key: 'free',
    icon: 'cake-slice',
    label: 'Free',
    description: 'Free variant, subject to request limits and may have low availability.',
    color: 'pink',
    resolve: (endpoint) => ({
      active: endpoint.model?.variant === 'free',
    }),
  },

  // Status Flags
  deranked: {
    key: 'deranked',
    icon: 'chevrons-down',
    label: 'Deranked',
    description: 'Will only be routed to as a fallback',
    color: 'amber',
    resolve: (endpoint) => ({
      active: endpoint.deranked ?? false,
    }),
  },

  disabled: {
    key: 'disabled',
    icon: 'octagon-x',
    label: 'Disabled',
    description: 'Endpoint is currently disabled',
    color: 'red',
    resolve: (endpoint) => ({
      active: endpoint.disabled ?? false,
    }),
  },

  gone: {
    key: 'gone',
    icon: 'skull',
    label: 'Gone',
    description: 'This endpoint no longer exists.',
    color: 'rose',
    resolve: (endpoint) => ({
      active: !!endpoint.unavailable_at,
      details: endpoint.unavailable_at
        ? [
            {
              label: 'Last Seen',
              value: formatDateTime(endpoint.unavailable_at),
            },
          ]
        : undefined,
    }),
  },

  // Data Policy
  training: {
    key: 'training',
    icon: 'scan-eye',
    label: 'Training',
    description: 'Your data may be used to train new models.',
    color: 'orange',
    resolve: (endpoint) => ({
      active: endpoint.data_policy?.training === true,
    }),
  },

  data_publishing: {
    key: 'data_publishing',
    icon: 'scroll-text',
    label: 'Data Publishing',
    description: 'Your data may be published or shared publicly.',
    color: 'orange',
    resolve: (endpoint) => ({
      active: endpoint.data_policy?.can_publish === true,
    }),
  },

  user_id: {
    key: 'user_id',
    icon: 'fingerprint',
    label: 'User ID',
    description: 'An anonymous user ID is shared with the provider.',
    color: 'orange',
    resolve: (endpoint) => ({
      active: endpoint.data_policy?.requires_user_ids === true,
    }),
  },

  data_retention: {
    key: 'data_retention',
    icon: 'save',
    label: 'Data Retention',
    description: 'Your data may be retained by the provider.',
    color: 'orange',
    resolve: (endpoint) => {
      const active = endpoint.data_policy?.retains_prompts === true
      const days = endpoint.data_policy?.retains_prompts_days?.toLocaleString()
      const value = days ? `${days} days` : '? days'
      return {
        active,
        value,
      }
    },
  },

  // Limits
  max_text_input_tokens: {
    key: 'max_text_input_tokens',
    icon: 'letter-text',
    label: 'Max Context',
    description: 'Maximum text input tokens allowed',
    color: 'yellow',
    resolve: (endpoint) => ({
      active: endpoint.limits?.text_input_tokens != null,
      value: endpoint.limits?.text_input_tokens?.toLocaleString(),
    }),
  },

  max_image_input_tokens: {
    key: 'max_image_input_tokens',
    icon: 'image',
    label: 'Max Image Tokens',
    description: 'Maximum image input tokens allowed',
    color: 'yellow',
    resolve: (endpoint) => ({
      active: endpoint.limits?.image_input_tokens != null,
      value: endpoint.limits?.image_input_tokens?.toLocaleString(),
    }),
  },

  max_images_per_input: {
    key: 'max_images_per_input',
    icon: 'image',
    label: 'Max Images',
    description: 'Maximum number of images per input',
    color: 'yellow',
    resolve: (endpoint) => ({
      active: endpoint.limits?.images_per_input != null,
      value: endpoint.limits?.images_per_input?.toLocaleString(),
    }),
  },

  max_requests_per_minute: {
    key: 'max_requests_per_minute',
    icon: 'alarm-clock',
    label: 'Max Requests/Min',
    description: 'Maximum requests per minute allowed',
    color: 'yellow',
    resolve: (endpoint) => ({
      active: endpoint.limits?.requests_per_minute != null,
      value: endpoint.limits?.requests_per_minute?.toLocaleString(),
    }),
  },

  max_requests_per_day: {
    key: 'max_requests_per_day',
    icon: 'calendar',
    label: 'Max Requests/Day',
    description: 'Maximum requests per day allowed',
    color: 'yellow',
    resolve: (endpoint) => ({
      active: endpoint.limits?.requests_per_day != null,
      value: endpoint.limits?.requests_per_day?.toLocaleString(),
    }),
  },

  // Modalities
  image_input: {
    key: 'image_input',
    icon: 'image-up',
    label: 'Image Input',
    description: 'Supports image input',
    color: 'violet',
    resolve: (endpoint) => {
      const active = endpoint.model?.input_modalities?.includes('image') ?? false
      const items = []

      if (endpoint.pricing?.image_input) {
        items.push({
          label: 'Input',
          value: formatPrice({
            priceKey: 'image_input',
            priceValue: endpoint.pricing.image_input,
          }),
        })
      }

      return {
        active,
        details: items.length > 0 ? items : undefined,
      }
    },
  },

  image_output: {
    key: 'image_output',
    icon: 'image-down',
    label: 'Image Output',
    description: 'Supports image output',
    color: 'violet',
    resolve: (endpoint) => {
      const active = endpoint.model?.output_modalities?.includes('image') ?? false
      const items = []

      if (endpoint.pricing?.image_output) {
        items.push({
          label: 'Output',
          value: formatPrice({
            priceKey: 'image_output',
            priceValue: endpoint.pricing.image_output,
          }),
        })
      }

      return {
        active,
        details: items.length > 0 ? items : undefined,
      }
    },
  },

  file_input: {
    key: 'file_input',
    icon: 'file-spreadsheet',
    label: 'File Input',
    description: 'Supports file input',
    color: 'sky',
    resolve: (endpoint) => ({
      active: endpoint.model?.input_modalities?.includes('file') ?? false,
    }),
  },

  audio_input: {
    key: 'audio_input',
    icon: 'audio-lines',
    label: 'Audio Input',
    description: 'Supports audio input',
    color: 'fuchsia',
    resolve: (endpoint) => {
      const active = endpoint.model?.input_modalities?.includes('audio') ?? false
      const items = []

      if (endpoint.pricing?.audio_input) {
        items.push({
          label: 'Input',
          value: formatPrice({
            priceKey: 'audio_input',
            priceValue: endpoint.pricing.audio_input,
          }),
        })
      }

      if (endpoint.pricing?.audio_cache_input) {
        items.push({
          label: 'Cache',
          value: formatPrice({
            priceKey: 'audio_cache_input',
            priceValue: endpoint.pricing.audio_cache_input,
          }),
        })
      }

      return {
        active,
        details: items.length > 0 ? items : undefined,
      }
    },
  },

  video_input: {
    key: 'video_input',
    icon: 'video',
    label: 'Video Input',
    description: 'Supports video input',
    color: 'emerald',
    resolve: (endpoint) => ({
      active: endpoint.model?.input_modalities?.includes('video') ?? false,
    }),
  },

  embeddings_output: {
    key: 'embeddings_output',
    icon: 'file-digit',
    label: 'Embeddings',
    description: 'Supports embeddings output',
    color: 'amber',
    resolve: (endpoint) => ({
      active: endpoint.model?.output_modalities?.includes('embeddings') ?? false,
    }),
  },

  // Request Pricing & Limits
  request: {
    key: 'request',
    icon: 'flag',
    label: 'Request',
    description: 'Flat rate fee for every request.',
    color: 'yellow',
    resolve: (endpoint) => {
      const active = !!endpoint.pricing?.request
      const items = []

      if (endpoint.pricing?.request) {
        items.push({
          label: 'Per Request',
          value: formatPrice({
            priceKey: 'request',
            priceValue: endpoint.pricing.request,
          }),
        })
      }

      return {
        active,
        details: items.length > 0 ? items : undefined,
      }
    },
  },

  threshold_pricing: {
    key: 'threshold_pricing',
    icon: 'flag',
    label: 'Threshold Pricing',
    description: 'Pricing varies based on prompt token threshold',
    color: 'yellow',
    resolve: (endpoint) => {
      const active = !!endpoint.variable_pricings && endpoint.variable_pricings.length > 0
      return {
        active,
      }
    },
  },
} as const

/**
 * Resolve a specific threshold pricing entry to an attribute state
 */
export function resolveThresholdPricing(
  variablePricing: NonNullable<EndpointPartial['variable_pricings']>[number],
): ReturnType<Attribute['resolve']> {
  if (variablePricing.type !== 'prompt-threshold') {
    return { active: false }
  }

  const details: { label?: string; value: string }[] = [
    {
      label: 'Threshold',
      value: `> ${variablePricing.threshold.toLocaleString()} tokens`,
    },
    {
      label: 'Text Input',
      value: formatPrice({
        priceKey: 'text_input',
        priceValue: variablePricing.text_input,
      }),
    },
    {
      label: 'Text Output',
      value: formatPrice({
        priceKey: 'text_output',
        priceValue: variablePricing.text_output,
      }),
    },
  ]

  if (variablePricing.cache_read) {
    details.push({
      label: 'Cache Read',
      value: formatPrice({
        priceKey: 'cache_read',
        priceValue: variablePricing.cache_read,
      }),
    })
  }

  if (variablePricing.cache_write) {
    details.push({
      label: 'Cache Write',
      value: formatPrice({
        priceKey: 'cache_write',
        priceValue: variablePricing.cache_write,
      }),
    })
  }

  return {
    active: true,
    details,
  }
}

export type AttributeName = keyof typeof attributes

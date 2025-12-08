import type { VariantProps } from 'class-variance-authority'

import { Doc } from '@/convex/_generated/dataModel'

import { InlineCode } from '@/components/shared/inline-code'
import { RadIconBadge } from '@/components/shared/rad-badge'
import { SpriteIconName } from '@/lib/sprite-icons'

import { formatDateTime, formatPrice } from './formatters'

type EndpointPartial = Partial<Doc<'or_views_endpoints'>>
type Color = VariantProps<typeof RadIconBadge>['color']

export interface Attribute {
  key: string
  icon: SpriteIconName
  label: string
  description: React.ReactNode
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
    description: (
      <>
        Extended thinking with chain-of-thought visible in{' '}
        <InlineCode>reasoning_content</InlineCode>.
      </>
    ),
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
    description: (
      <>
        Always emits reasoning tokens; cannot be disabled via{' '}
        <InlineCode>reasoning_effort</InlineCode>.
      </>
    ),
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
    description: (
      <>
        Function calling via the <InlineCode>tools</InlineCode> parameter for agentic workflows.
      </>
    ),
    color: 'blue',
    resolve: (endpoint) => ({
      active: endpoint.supported_parameters?.includes('tools') ?? false,
    }),
  },

  response_format: {
    key: 'response_format',
    icon: 'braces',
    label: 'Response Format',
    description: (
      <>
        Constrain output to valid JSON via{' '}
        <InlineCode>{'response_format: { type: "json_object" }'}</InlineCode>.
      </>
    ),
    color: 'teal',
    resolve: (endpoint) => ({
      active: endpoint.supported_parameters?.includes('response_format') ?? false,
    }),
  },

  structured_outputs: {
    key: 'structured_outputs',
    icon: 'braces',
    label: 'Structured Outputs',
    description: (
      <>
        Enforce a JSON schema via{' '}
        <InlineCode>{'response_format: { type: "json_schema" }'}</InlineCode>.
      </>
    ),
    color: 'teal',
    resolve: (endpoint) => ({
      active: endpoint.supported_parameters?.includes('structured_outputs') ?? false,
    }),
  },

  caching: {
    key: 'caching',
    icon: 'database',
    label: 'Caching',
    description: 'Reduce costs on repeated prompts with explicit prompt caching.',
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
    description: (
      <>
        Provider caches prompts automatically without explicit{' '}
        <InlineCode>cache_control</InlineCode>.
      </>
    ),
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
    description: 'OpenRouter applies content filtering before forwarding to the provider.',
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
    description: 'Pass files via URL instead of base64 encoding in the request body.',
    color: 'purple',
    resolve: (endpoint) => ({
      active: endpoint.file_urls ?? false,
    }),
  },

  native_web_search: {
    key: 'native_web_search',
    icon: 'globe',
    label: 'Native Web Search',
    description: 'Model can search the web for real-time information.',
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
    description: (
      <>
        Legacy <InlineCode>/completions</InlineCode> endpoint for raw text continuation.
      </>
    ),
    color: 'blue',
    resolve: (endpoint) => ({
      active: endpoint.completions ?? false,
    }),
  },

  chat_completions: {
    key: 'chat_completions',
    icon: 'messages-square',
    label: 'Chat Completions',
    description: (
      <>
        Standard <InlineCode>/chat/completions</InlineCode> endpoint with message arrays.
      </>
    ),
    color: 'blue',
    resolve: (endpoint) => ({
      active: endpoint.chat_completions ?? false,
    }),
  },

  stream_cancellation: {
    key: 'stream_cancellation',
    icon: 'square-stop',
    label: 'Stream Cancellation',
    description:
      'Abort streaming requests mid-response without being charged for remaining tokens.',
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
    description: 'No cost per token. May have stricter rate limits and lower availability.',
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
    description: 'Deprioritized in routing; only used as fallback when preferred endpoints fail.',
    color: 'amber',
    resolve: (endpoint) => ({
      active: endpoint.deranked ?? false,
    }),
  },

  disabled: {
    key: 'disabled',
    icon: 'octagon-x',
    label: 'Disabled',
    description: 'Temporarily unavailable; requests will fail or route elsewhere.',
    color: 'red',
    resolve: (endpoint) => ({
      active: endpoint.disabled ?? false,
    }),
  },

  gone: {
    key: 'gone',
    icon: 'skull',
    label: 'Gone',
    description: 'This endpoint is no longer available.',
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
    description: 'Provider may use your prompts and completions for model training.',
    color: 'orange',
    resolve: (endpoint) => ({
      active: endpoint.data_policy?.training === true,
    }),
  },

  data_publishing: {
    key: 'data_publishing',
    icon: 'scroll-text',
    label: 'Data Publishing',
    description: 'Provider may publish or share your data in research or datasets.',
    color: 'orange',
    resolve: (endpoint) => ({
      active: endpoint.data_policy?.can_publish === true,
    }),
  },

  user_id: {
    key: 'user_id',
    icon: 'fingerprint',
    label: 'User ID',
    description: 'An anonymized ID is forwarded to the provider with your request.',
    color: 'orange',
    resolve: (endpoint) => ({
      active: endpoint.data_policy?.requires_user_ids === true,
    }),
  },

  data_retention: {
    key: 'data_retention',
    icon: 'save',
    label: 'Data Retention',
    description: 'Provider stores prompts and completions for a limited period.',
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
    description: 'Context window limit for this endpoint (may differ from model maximum).',
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
    description: 'Token budget consumed by image inputs.',
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
    description: 'Number of images allowed in a single request.',
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
    description: 'Rate limit enforced by this endpoint.',
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
    description: 'Daily request quota enforced by this endpoint.',
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
    description: 'Vision model that accepts images in message content.',
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
    description: 'Generates images inline within the response.',
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
    description: 'Process documents like PDFs, CSVs, and spreadsheets.',
    color: 'sky',
    resolve: (endpoint) => ({
      active: endpoint.model?.input_modalities?.includes('file') ?? false,
    }),
  },

  audio_input: {
    key: 'audio_input',
    icon: 'audio-lines',
    label: 'Audio Input',
    description: 'Process speech and audio directly without transcription.',
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
    description: 'Analyze video content frame-by-frame.',
    color: 'emerald',
    resolve: (endpoint) => ({
      active: endpoint.model?.input_modalities?.includes('video') ?? false,
    }),
  },

  embeddings_output: {
    key: 'embeddings_output',
    icon: 'file-digit',
    label: 'Embeddings',
    description: 'Returns vector representations for semantic search and RAG.',
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
    description: 'Fixed fee charged per API call, regardless of token count.',
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
    description: 'Different rates apply based on prompt length tiers.',
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

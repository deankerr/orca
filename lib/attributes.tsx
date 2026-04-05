import { InlineCode } from '@/components/shared/inline-code'
import { SpriteIconBadgeColor } from '@/components/shared/sprite-icon-badge'
import type { ORCAEndpoint } from '@/convex/db/or/views/endpoints'
import { SpriteIconName } from '@/lib/sprite-icons'

import { formatDateTime, formatPrice } from './formatters'

type EndpointPartial = Partial<ORCAEndpoint>

export interface AttributeState {
  active: boolean
  value?: string
  details?: { label?: string; value: string }[]
}

interface AttributeDefinition {
  icon: SpriteIconName
  label: string
  description: React.ReactNode
  color: SpriteIconBadgeColor
  referenceUrl?: string
  resolve: (endpoint: EndpointPartial) => AttributeState
}

type AttributeDefinitions = {
  [K in string]: AttributeDefinition & { key: K }
}

function defineAttributes<T extends AttributeDefinitions>(definitions: T): T {
  return definitions
}

export const attributes = defineAttributes({
  // Features (model)
  reasoning: {
    key: 'reasoning',
    icon: 'brain-cog',
    label: 'Reasoning',
    description: (
      <>
        Produces thinking tokens with chain-of-thought visible in{' '}
        <InlineCode>reasoning_content</InlineCode>.
      </>
    ),
    color: 'indigo',
    referenceUrl: 'https://openrouter.ai/docs/guides/best-practices/reasoning-tokens',
    resolve: (endpoint) => {
      const active = endpoint.model?.reasoning ?? false
      const items = []

      if (endpoint.pricing?.reasoning_output) {
        items.push({
          label: 'Output',
          value: formatPrice({
            priceKey: 'reasoning_output',
            priceValue: endpoint.pricing.reasoning_output,
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
        Function calling via the <InlineCode>tools</InlineCode> parameter.
      </>
    ),
    color: 'blue',
    referenceUrl: 'https://openrouter.ai/docs/guides/features/tool-calling',
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
    referenceUrl: 'https://openrouter.ai/docs/api/reference/parameters',
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
    referenceUrl: 'https://openrouter.ai/docs/guides/features/structured-outputs',
    resolve: (endpoint) => ({
      active: endpoint.supported_parameters?.includes('structured_outputs') ?? false,
    }),
  },

  caching: {
    key: 'caching',
    icon: 'database',
    label: 'Caching',
    description: 'Reduced pricing on cache hits for repeated prompt content.',
    color: 'cyan',
    referenceUrl: 'https://openrouter.ai/docs/guides/best-practices/prompt-caching',
    resolve: (endpoint) => {
      const active = !!endpoint.pricing?.text_cache_read
      const items = []

      if (endpoint.pricing?.text_cache_read) {
        items.push({
          label: 'Read',
          value: formatPrice({
            priceKey: 'text_cache_read',
            priceValue: endpoint.pricing.text_cache_read,
          }),
        })
      }

      if (endpoint.pricing?.text_cache_write) {
        items.push({
          label: 'Write',
          value: formatPrice({
            priceKey: 'text_cache_write',
            priceValue: endpoint.pricing.text_cache_write,
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
    referenceUrl: 'https://openrouter.ai/docs/guides/best-practices/prompt-caching',
    resolve: (endpoint) => {
      const active = endpoint.implicit_caching ?? false
      const items = []

      if (endpoint.pricing?.text_cache_read) {
        items.push({
          label: 'Read',
          value: formatPrice({
            priceKey: 'text_cache_read',
            priceValue: endpoint.pricing.text_cache_read,
          }),
        })
      }

      if (endpoint.pricing?.text_cache_write) {
        items.push({
          label: 'Write',
          value: formatPrice({
            priceKey: 'text_cache_write',
            priceValue: endpoint.pricing.text_cache_write,
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

  native_web_search: {
    key: 'native_web_search',
    icon: 'globe',
    label: 'Native Web Search',
    description: 'Provider handles web search natively, without the OpenRouter plugin.',
    color: 'emerald',
    referenceUrl: 'https://openrouter.ai/docs/guides/features/plugins/web-search',
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
    referenceUrl: 'https://openrouter.ai/docs/api/reference/overview',
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
    referenceUrl: 'https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request',
    resolve: (endpoint) => ({
      active: endpoint.chat_completions ?? false,
    }),
  },

  // Variant
  free: {
    key: 'free',
    icon: 'cake-slice',
    label: 'Free',
    description: 'Zero-cost inference. May have stricter rate limits and lower availability.',
    color: 'pink',
    referenceUrl: 'https://openrouter.ai/docs/guides/routing/model-variants/free',
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
    referenceUrl: 'https://openrouter.ai/docs/guides/routing/auto-exacto',
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
    referenceUrl: 'https://openrouter.ai/docs/guides/privacy/data-collection',
    resolve: (endpoint) => ({
      active: endpoint.data_policy?.may_train_on_data === true,
    }),
  },

  data_publishing: {
    key: 'data_publishing',
    icon: 'scroll-text',
    label: 'Data Publishing',
    description: 'Provider may publish or share your data in research or datasets.',
    color: 'orange',
    referenceUrl: 'https://openrouter.ai/docs/guides/privacy/data-collection',
    resolve: (endpoint) => ({
      active: endpoint.data_policy?.may_publish_data === true,
    }),
  },

  user_id: {
    key: 'user_id',
    icon: 'fingerprint',
    label: 'User ID',
    description: 'An anonymized ID is forwarded to the provider with your request.',
    color: 'orange',
    referenceUrl: 'https://openrouter.ai/docs/guides/administration/user-tracking',
    resolve: (endpoint) => ({
      active: endpoint.data_policy?.shares_user_id === true,
    }),
  },

  data_retention: {
    key: 'data_retention',
    icon: 'save',
    label: 'Data Retention',
    description: 'Provider stores prompts and completions for a limited period.',
    color: 'orange',
    referenceUrl: 'https://openrouter.ai/docs/guides/features/zdr',
    resolve: (endpoint) => {
      const active = endpoint.data_policy?.may_retain_data === true
      const days = endpoint.data_policy?.data_retention_days?.toLocaleString()
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
    referenceUrl: 'https://openrouter.ai/docs/api/reference/limits',
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
    referenceUrl: 'https://openrouter.ai/docs/api/reference/limits',
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
    referenceUrl: 'https://openrouter.ai/docs/api/reference/limits',
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
    description: 'Accepts images via URL or base64 content parts.',
    color: 'violet',
    referenceUrl: 'https://openrouter.ai/docs/guides/overview/multimodal/images',
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
    description: 'Generates images inline in the completion response.',
    color: 'violet',
    referenceUrl: 'https://openrouter.ai/docs/guides/overview/multimodal/image-generation',
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
    description: 'Accepts document and file uploads as input.',
    color: 'sky',
    referenceUrl: 'https://openrouter.ai/docs/guides/overview/multimodal/pdfs',
    resolve: (endpoint) => ({
      active: endpoint.model?.input_modalities?.includes('file') ?? false,
    }),
  },

  audio_input: {
    key: 'audio_input',
    icon: 'audio-lines',
    label: 'Audio Input',
    description: 'Natively processes audio without a separate transcription step.',
    color: 'fuchsia',
    referenceUrl: 'https://openrouter.ai/docs/guides/overview/multimodal/audio',
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

      if (endpoint.pricing?.audio_cache_write) {
        items.push({
          label: 'Cache',
          value: formatPrice({
            priceKey: 'audio_cache_write',
            priceValue: endpoint.pricing.audio_cache_write,
          }),
        })
      }

      return {
        active,
        details: items.length > 0 ? items : undefined,
      }
    },
  },

  audio_output: {
    key: 'audio_output',
    icon: 'audio-lines',
    label: 'Audio Output',
    description: 'Generates audio inline in the completion response.',
    color: 'fuchsia',
    referenceUrl: 'https://openrouter.ai/docs/guides/overview/multimodal/audio',
    resolve: (endpoint) => ({
      active: endpoint.model?.output_modalities?.includes('audio') ?? false,
    }),
  },

  video_input: {
    key: 'video_input',
    icon: 'video',
    label: 'Video Input',
    description: 'Accepts video content via URL or base64.',
    color: 'emerald',
    referenceUrl: 'https://openrouter.ai/docs/guides/overview/multimodal/videos',
    resolve: (endpoint) => ({
      active: endpoint.model?.input_modalities?.includes('video') ?? false,
    }),
  },

  video_output: {
    key: 'video_output',
    icon: 'video',
    label: 'Video Output',
    description: 'Generates video inline in the completion response.',
    color: 'emerald',
    referenceUrl: 'https://openrouter.ai/docs/guides/overview/multimodal/videos',
    resolve: (endpoint) => ({
      active: endpoint.model?.output_modalities?.includes('video') ?? false,
    }),
  },

  embeddings_output: {
    key: 'embeddings_output',
    icon: 'file-digit',
    label: 'Embeddings',
    description: 'Returns vector representations for semantic search and RAG.',
    color: 'amber',
    referenceUrl: 'https://openrouter.ai/docs/api/api-reference/embeddings/create-embeddings',
    resolve: (endpoint) => ({
      active: endpoint.model?.output_modalities?.includes('embeddings') ?? false,
    }),
  },

  // Request Pricing & Limits
  long_context_pricing: {
    key: 'long_context_pricing',
    icon: 'flag',
    label: 'Long Context Pricing',
    description: 'Higher rates apply when prompt length exceeds a token threshold.',
    color: 'yellow',
    resolve: (endpoint) => {
      // only a single 'prompt-threshold' item can exist
      const variablePricing = endpoint.variable_pricings?.find(
        (vp) => vp.type === 'prompt-threshold',
      )

      if (!variablePricing) {
        return { active: false }
      }

      const details: { label: string; value: string }[] = [
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
    },
  },
})

export type AttributeKey = keyof typeof attributes
export type AttributeSlots = AttributeKey[][]
export type Attribute = AttributeDefinition & { key: AttributeKey }

export function isAttributeKey(value: string): value is AttributeKey {
  return Object.hasOwn(attributes, value)
}

export function resolveEndpointAttribute(endpoint: EndpointPartial, key: AttributeKey) {
  const attribute = attributes[key]
  const data = attribute.resolve(endpoint)

  return { attribute, data } as { attribute: Attribute; data: AttributeState }
}

export function resolveEndpointAttributeSlot(endpoint: EndpointPartial, slot: AttributeKey[]) {
  for (const key of slot) {
    const result = resolveEndpointAttribute(endpoint, key)
    if (result.data.active) {
      return result
    }
  }
}

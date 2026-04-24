import type { EndpointProjection } from '@orca/backend/convex/catalog/endpoints'
import { formatPricing } from '@orca/backend/shared/formatters'
import type { LucideIcon } from 'lucide-react'
import {
  AlarmClock,
  AudioLines,
  BrainCog,
  Braces,
  CakeSlice,
  Calendar,
  ChevronsDown,
  Database,
  FileChartColumn,
  FileDigit,
  FileSpreadsheet,
  Fingerprint,
  Flag,
  Globe,
  Image,
  ImageDown,
  ImageUp,
  LetterText,
  MessageSquare,
  MessagesSquare,
  OctagonX,
  Save,
  ScanEye,
  ScrollText,
  ShieldAlert,
  Skull,
  Speech,
  Video,
  Wrench,
} from 'lucide-react'

import type { ColorIconBadgeColor } from '@/components/shared/color-icon-badge'
import { InlineCode } from '@/components/shared/inline-code'

type EndpointPartial = Partial<EndpointProjection>
type AttributeIcon = LucideIcon

export interface AttributeState {
  active: boolean
  value?: string
  details?: { label?: string; value: string }[]
}

interface AttributeDefinition {
  icon: AttributeIcon
  label: string
  description: React.ReactNode
  color: ColorIconBadgeColor
  referenceUrl?: string
  resolve: (endpoint: EndpointPartial) => AttributeState
}

type AttributeDefinitions = {
  [K in string]: AttributeDefinition & { key: K }
}

function defineAttributes<T extends AttributeDefinitions>(definitions: T): T {
  return definitions
}

function hasValue<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}

function formatAttributePrice(field: Parameters<typeof formatPricing>[0], value: number): string {
  const formatted = formatPricing(field, value)
  if (!formatted) {
    return String(value)
  }
  return formatted.unit ? `${formatted.value}/${formatted.unit}` : formatted.value
}

function formatAttributeDateTime(timestamp: number): string {
  return new Date(timestamp)
    .toLocaleString('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    .replace(',', '')
}

export const attributes = defineAttributes({
  // Features (model)
  reasoning: {
    key: 'reasoning',
    icon: BrainCog,
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
      const reasoningOutputPrice = endpoint.pricing?.reasoning_output

      if (hasValue(reasoningOutputPrice)) {
        items.push({
          label: 'Output',
          value: formatAttributePrice('reasoning_output', reasoningOutputPrice),
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
    icon: Wrench,
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
    icon: Braces,
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
    icon: Braces,
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
    icon: Database,
    label: 'Caching',
    description: 'Reduced pricing on cache hits for repeated prompt content.',
    color: 'cyan',
    referenceUrl: 'https://openrouter.ai/docs/guides/best-practices/prompt-caching',
    resolve: (endpoint) => {
      const textCacheRead = endpoint.pricing?.text_cache_read
      const textCacheWrite = endpoint.pricing?.text_cache_write
      const active = hasValue(textCacheRead)
      const items = []

      if (hasValue(textCacheRead)) {
        items.push({
          label: 'Read',
          value: formatAttributePrice('text_cache_read', textCacheRead),
        })
      }

      if (hasValue(textCacheWrite)) {
        items.push({
          label: 'Write',
          value: formatAttributePrice('text_cache_write', textCacheWrite),
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
    icon: Database,
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
      const textCacheRead = endpoint.pricing?.text_cache_read
      const textCacheWrite = endpoint.pricing?.text_cache_write

      if (hasValue(textCacheRead)) {
        items.push({
          label: 'Read',
          value: formatAttributePrice('text_cache_read', textCacheRead),
        })
      }

      if (hasValue(textCacheWrite)) {
        items.push({
          label: 'Write',
          value: formatAttributePrice('text_cache_write', textCacheWrite),
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
    icon: ShieldAlert,
    label: 'Moderated',
    description: 'OpenRouter applies content filtering before forwarding to the provider.',
    color: 'amber',
    resolve: (endpoint) => ({
      active: endpoint.moderated ?? false,
    }),
  },

  native_web_search: {
    key: 'native_web_search',
    icon: Globe,
    label: 'Native Web Search',
    description: 'Provider handles web search natively, without the OpenRouter plugin.',
    color: 'emerald',
    referenceUrl: 'https://openrouter.ai/docs/guides/features/plugins/web-search',
    resolve: (endpoint) => {
      const active = endpoint.native_web_search ?? false
      const items = []
      const webSearchPrice = endpoint.pricing?.web_search

      if (hasValue(webSearchPrice)) {
        items.push({
          label: 'Per Request',
          value: formatAttributePrice('web_search', webSearchPrice),
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
    icon: MessageSquare,
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
    icon: MessagesSquare,
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
    icon: CakeSlice,
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
    icon: ChevronsDown,
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
    icon: OctagonX,
    label: 'Disabled',
    description: 'Temporarily unavailable; requests will fail or route elsewhere.',
    color: 'red',
    resolve: (endpoint) => ({
      active: endpoint.disabled ?? false,
    }),
  },

  gone: {
    key: 'gone',
    icon: Skull,
    label: 'Gone',
    description: 'This endpoint is no longer available.',
    color: 'rose',
    resolve: (endpoint) => ({
      active: hasValue(endpoint.unavailable_at),
      details: hasValue(endpoint.unavailable_at)
        ? [
            {
              label: 'Last Seen',
              value: formatAttributeDateTime(endpoint.unavailable_at),
            },
          ]
        : undefined,
    }),
  },

  // Data Policy
  training: {
    key: 'training',
    icon: ScanEye,
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
    icon: ScrollText,
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
    icon: Fingerprint,
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
    icon: Save,
    label: 'Data Retention',
    description: 'Provider stores prompts and completions for a limited period.',
    color: 'orange',
    referenceUrl: 'https://openrouter.ai/docs/guides/features/zdr',
    resolve: (endpoint) => {
      const active = endpoint.data_policy?.may_retain_data === true
      const days = endpoint.data_policy?.data_retention_days?.toLocaleString()
      const value = days === undefined ? '? days' : `${days} days`
      return {
        active,
        value,
      }
    },
  },

  // Limits
  max_text_input_tokens: {
    key: 'max_text_input_tokens',
    icon: LetterText,
    label: 'Max Context',
    description: 'Context window limit for this endpoint (may differ from model maximum).',
    color: 'yellow',
    referenceUrl: 'https://openrouter.ai/docs/api/reference/limits',
    resolve: (endpoint) => ({
      active:
        endpoint.limits?.text_input_tokens !== undefined &&
        endpoint.limits.text_input_tokens !== null,
      value: endpoint.limits?.text_input_tokens?.toLocaleString(),
    }),
  },

  max_image_input_tokens: {
    key: 'max_image_input_tokens',
    icon: Image,
    label: 'Max Image Tokens',
    description: 'Token budget consumed by image inputs.',
    color: 'yellow',
    resolve: (endpoint) => ({
      active:
        endpoint.limits?.image_input_tokens !== undefined &&
        endpoint.limits.image_input_tokens !== null,
      value: endpoint.limits?.image_input_tokens?.toLocaleString(),
    }),
  },

  max_images_per_input: {
    key: 'max_images_per_input',
    icon: Image,
    label: 'Max Images',
    description: 'Number of images allowed in a single request.',
    color: 'yellow',
    resolve: (endpoint) => ({
      active:
        endpoint.limits?.images_per_input !== undefined &&
        endpoint.limits.images_per_input !== null,
      value: endpoint.limits?.images_per_input?.toLocaleString(),
    }),
  },

  max_requests_per_minute: {
    key: 'max_requests_per_minute',
    icon: AlarmClock,
    label: 'Max Requests/Min',
    description: 'Rate limit enforced by this endpoint.',
    color: 'yellow',
    referenceUrl: 'https://openrouter.ai/docs/api/reference/limits',
    resolve: (endpoint) => ({
      active:
        endpoint.limits?.requests_per_minute !== undefined &&
        endpoint.limits.requests_per_minute !== null,
      value: endpoint.limits?.requests_per_minute?.toLocaleString(),
    }),
  },

  max_requests_per_day: {
    key: 'max_requests_per_day',
    icon: Calendar,
    label: 'Max Requests/Day',
    description: 'Daily request quota enforced by this endpoint.',
    color: 'yellow',
    referenceUrl: 'https://openrouter.ai/docs/api/reference/limits',
    resolve: (endpoint) => ({
      active:
        endpoint.limits?.requests_per_day !== undefined &&
        endpoint.limits.requests_per_day !== null,
      value: endpoint.limits?.requests_per_day?.toLocaleString(),
    }),
  },

  // Modalities
  image_input: {
    key: 'image_input',
    icon: ImageUp,
    label: 'Image Input',
    description: 'Accepts images via URL or base64 content parts.',
    color: 'violet',
    referenceUrl: 'https://openrouter.ai/docs/guides/overview/multimodal/images',
    resolve: (endpoint) => {
      const active = endpoint.model?.input_modalities?.includes('image') ?? false
      const items = []
      const imageInputPrice = endpoint.pricing?.image_input

      if (hasValue(imageInputPrice)) {
        items.push({
          label: 'Input',
          value: formatAttributePrice('image_input', imageInputPrice),
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
    icon: ImageDown,
    label: 'Image Output',
    description: 'Generates images inline in the completion response.',
    color: 'violet',
    referenceUrl: 'https://openrouter.ai/docs/guides/overview/multimodal/image-generation',
    resolve: (endpoint) => {
      const active = endpoint.model?.output_modalities?.includes('image') ?? false
      const items = []
      const imageOutputPrice = endpoint.pricing?.image_output

      if (hasValue(imageOutputPrice)) {
        items.push({
          label: 'Output',
          value: formatAttributePrice('image_output', imageOutputPrice),
        })
      }

      return {
        active,
        details: items.length > 0 ? items : undefined,
      }
    },
  },

  text_output: {
    key: 'text_output',
    icon: LetterText,
    label: 'Text Output',
    description: 'Returns text in the completion response.',
    color: 'zinc',
    resolve: (endpoint) => ({
      active: endpoint.model?.output_modalities?.includes('text') ?? false,
    }),
  },

  file_input: {
    key: 'file_input',
    icon: FileSpreadsheet,
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
    icon: AudioLines,
    label: 'Audio Input',
    description: 'Natively processes audio without a separate transcription step.',
    color: 'fuchsia',
    referenceUrl: 'https://openrouter.ai/docs/guides/overview/multimodal/audio',
    resolve: (endpoint) => {
      const active = endpoint.model?.input_modalities?.includes('audio') ?? false
      const items = []
      const audioInputPrice = endpoint.pricing?.audio_input
      const audioCacheWritePrice = endpoint.pricing?.audio_cache_write

      if (hasValue(audioInputPrice)) {
        items.push({
          label: 'Input',
          value: formatAttributePrice('audio_input', audioInputPrice),
        })
      }

      if (hasValue(audioCacheWritePrice)) {
        items.push({
          label: 'Cache',
          value: formatAttributePrice('audio_cache_write', audioCacheWritePrice),
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
    icon: AudioLines,
    label: 'Audio Output',
    description: 'Generates audio inline in the completion response.',
    color: 'fuchsia',
    referenceUrl: 'https://openrouter.ai/docs/guides/overview/multimodal/audio',
    resolve: (endpoint) => ({
      active: endpoint.model?.output_modalities?.includes('audio') ?? false,
    }),
  },

  speech_output: {
    key: 'speech_output',
    icon: Speech,
    label: 'Speech Output',
    description: 'Generates spoken audio output.',
    color: 'cyan',
    referenceUrl: 'https://openrouter.ai/docs/guides/overview/multimodal/audio',
    resolve: (endpoint) => ({
      active: endpoint.model?.output_modalities?.includes('speech') ?? false,
    }),
  },

  video_input: {
    key: 'video_input',
    icon: Video,
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
    icon: Video,
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
    icon: FileDigit,
    label: 'Embeddings',
    description: 'Returns vector representations for semantic search and RAG.',
    color: 'amber',
    referenceUrl: 'https://openrouter.ai/docs/api/api-reference/embeddings/create-embeddings',
    resolve: (endpoint) => ({
      active: endpoint.model?.output_modalities?.includes('embeddings') ?? false,
    }),
  },

  rerank_output: {
    key: 'rerank_output',
    icon: FileChartColumn,
    label: 'Rerank Output',
    description: 'Returns ranked results with relevance scores for reranking workloads.',
    color: 'amber',
    resolve: (endpoint) => ({
      active: endpoint.model?.output_modalities?.includes('rerank') ?? false,
    }),
  },

  // Request Pricing & Limits
  long_context_pricing: {
    key: 'long_context_pricing',
    icon: Flag,
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
          value: formatAttributePrice('text_input', variablePricing.text_input),
        },
        {
          label: 'Text Output',
          value: formatAttributePrice('text_output', variablePricing.text_output),
        },
      ]

      if (hasValue(variablePricing.cache_read)) {
        details.push({
          label: 'Cache Read',
          value: formatAttributePrice('text_cache_read', variablePricing.cache_read),
        })
      }

      if (hasValue(variablePricing.cache_write)) {
        details.push({
          label: 'Cache Write',
          value: formatAttributePrice('text_cache_write', variablePricing.cache_write),
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
export type Attribute = (typeof attributes)[AttributeKey]

export function isAttributeKey(value: string): value is AttributeKey {
  return Object.hasOwn(attributes, value)
}

function resolveEndpointAttribute(endpoint: EndpointPartial, key: AttributeKey) {
  const attribute = attributes[key]
  const data = attribute.resolve(endpoint)

  return { attribute, data }
}

export function resolveEndpointAttributeSlot(endpoint: EndpointPartial, slot: AttributeKey[]) {
  for (const key of slot) {
    const result = resolveEndpointAttribute(endpoint, key)
    if (result.data.active) {
      return result
    }
  }

  return undefined
}

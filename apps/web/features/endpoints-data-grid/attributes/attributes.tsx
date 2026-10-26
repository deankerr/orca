import { formatPrice } from '@orca/backend/numbers'
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
  FileSpreadsheet,
  Fingerprint,
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
  Video,
  Wrench,
} from 'lucide-react'

import type { GridEndpoint } from '../data/grid-endpoints'
import type { ColorIconBadgeColor } from './color-icon-badge'
import { InlineCode } from './inline-code'

type EndpointPartial = Partial<GridEndpoint>

type AttributeIcon = LucideIcon

export interface AttributeState {
  active: boolean
  value?: string | undefined
  details?: { label?: string; value: string }[] | undefined
}

interface AttributeDefinition {
  icon: AttributeIcon
  label: string
  description: React.ReactNode
  color: ColorIconBadgeColor
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

function formatAttributeDateTime(timestamp: string): string {
  return new Date(timestamp)
    .toLocaleString('en-CA', {
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
      minute: '2-digit',
      month: '2-digit',
      second: '2-digit',
      year: 'numeric',
    })
    .replace(',', '')
}

export const attributes = defineAttributes({
  // Features (model)
  reasoning: {
    color: 'indigo',
    description: (
      <>
        Produces thinking tokens with chain-of-thought visible in{' '}
        <InlineCode>reasoning_content</InlineCode>.
      </>
    ),
    icon: BrainCog,
    key: 'reasoning',
    label: 'Reasoning',
    resolve: (endpoint) => ({
      active: endpoint.reasoning ?? false,
    }),
  },

  tools: {
    color: 'blue',
    description: (
      <>
        Function calling via the <InlineCode>tools</InlineCode> parameter.
      </>
    ),
    icon: Wrench,
    key: 'tools',
    label: 'Tools',
    resolve: (endpoint) => ({
      active: endpoint.supported_parameters?.includes('tools') ?? false,
    }),
  },

  response_format: {
    color: 'teal',
    description: (
      <>
        Constrain output to valid JSON via{' '}
        <InlineCode>{'response_format: { type: "json_object" }'}</InlineCode>.
      </>
    ),
    icon: Braces,
    key: 'response_format',
    label: 'Response Format',
    resolve: (endpoint) => ({
      active: endpoint.supported_parameters?.includes('response_format') ?? false,
    }),
  },

  structured_outputs: {
    color: 'teal',
    description: (
      <>
        Enforce a JSON schema via{' '}
        <InlineCode>{'response_format: { type: "json_schema" }'}</InlineCode>.
      </>
    ),
    icon: Braces,
    key: 'structured_outputs',
    label: 'Structured Outputs',
    resolve: (endpoint) => ({
      active: endpoint.supported_parameters?.includes('structured_outputs') ?? false,
    }),
  },

  caching: {
    color: 'cyan',
    description: 'Reduced pricing on cache hits for repeated prompt content.',
    icon: Database,
    key: 'caching',
    label: 'Caching',
    resolve: (endpoint) => ({
      active: hasValue(endpoint.pricing?.cache_read),
    }),
  },

  // Features (OpenRouter)
  moderated: {
    color: 'amber',
    description: 'OpenRouter applies content filtering before forwarding to the provider.',
    icon: ShieldAlert,
    key: 'moderated',
    label: 'Moderated',
    resolve: (endpoint) => ({
      active: endpoint.moderated ?? false,
    }),
  },

  native_web_search: {
    color: 'emerald',
    description: 'Provider handles web search natively, without the OpenRouter plugin.',
    icon: Globe,
    key: 'native_web_search',
    label: 'Native Web Search',
    resolve: (endpoint) => {
      const active = endpoint.native_web_search ?? false
      const items = []
      const webSearchPrice = endpoint.pricing?.web_search

      if (hasValue(webSearchPrice)) {
        items.push({
          label: 'Per Request',
          value: formatPrice(webSearchPrice) ?? String(webSearchPrice),
        })
      }

      return {
        active,
        details: items.length > 0 ? items : undefined,
      }
    },
  },

  completions: {
    color: 'blue',
    description: (
      <>
        Legacy <InlineCode>/completions</InlineCode> endpoint for raw text continuation.
      </>
    ),
    icon: MessageSquare,
    key: 'completions',
    label: 'Completions',
    resolve: (endpoint) => ({
      active: endpoint.completions ?? false,
    }),
  },

  chat_completions: {
    color: 'blue',
    description: (
      <>
        Standard <InlineCode>/chat/completions</InlineCode> endpoint with message arrays.
      </>
    ),
    icon: MessagesSquare,
    key: 'chat_completions',
    label: 'Chat Completions',
    resolve: (endpoint) => ({
      active: endpoint.chat_completions ?? false,
    }),
  },

  // Variant
  free: {
    color: 'pink',
    description: 'Zero-cost inference. May have stricter rate limits and lower availability.',
    icon: CakeSlice,
    key: 'free',
    label: 'Free',
    resolve: (endpoint) => ({
      active: endpoint.variant === 'free',
    }),
  },

  // Status Flags
  deranked: {
    color: 'amber',
    description: 'Deprioritized in routing; only used as fallback when preferred endpoints fail.',
    icon: ChevronsDown,
    key: 'deranked',
    label: 'Deranked',
    resolve: (endpoint) => ({
      active: endpoint.deranked ?? false,
    }),
  },

  disabled: {
    color: 'red',
    description: 'Temporarily unavailable; requests will fail or route elsewhere.',
    icon: OctagonX,
    key: 'disabled',
    label: 'Disabled',
    resolve: (endpoint) => ({
      active: endpoint.disabled ?? false,
    }),
  },

  gone: {
    color: 'rose',
    description: 'This endpoint is no longer available.',
    icon: Skull,
    key: 'gone',
    label: 'Gone',
    resolve: (endpoint) => ({
      active: hasValue(endpoint.unlisted_at),
      details: hasValue(endpoint.unlisted_at)
        ? [
            {
              label: 'Last Seen',
              value: formatAttributeDateTime(endpoint.unlisted_at),
            },
          ]
        : undefined,
    }),
  },

  // Data Policy
  training: {
    color: 'orange',
    description: 'Provider may use your prompts and completions for model training.',
    icon: ScanEye,
    key: 'training',
    label: 'Training',
    resolve: (endpoint) => ({
      active: endpoint.data_policy?.may_train_on_data === true,
    }),
  },

  data_publishing: {
    color: 'orange',
    description: 'Provider may publish or share your data in research or datasets.',
    icon: ScrollText,
    key: 'data_publishing',
    label: 'Data Publishing',
    resolve: (endpoint) => ({
      active: endpoint.data_policy?.may_publish_data === true,
    }),
  },

  user_id: {
    color: 'orange',
    description: 'An anonymized ID is forwarded to the provider with your request.',
    icon: Fingerprint,
    key: 'user_id',
    label: 'User ID',
    resolve: (endpoint) => ({
      active: endpoint.data_policy?.shares_user_id === true,
    }),
  },

  data_retention: {
    color: 'orange',
    description: 'Provider stores prompts and completions for a limited period.',
    icon: Save,
    key: 'data_retention',
    label: 'Data Retention',
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
    color: 'yellow',
    description: 'Context window limit for this endpoint (may differ from model maximum).',
    icon: LetterText,
    key: 'max_text_input_tokens',
    label: 'Max Context',
    resolve: (endpoint) => ({
      active:
        endpoint.limits?.text_input_tokens !== undefined &&
        endpoint.limits.text_input_tokens !== null,
      value: endpoint.limits?.text_input_tokens?.toLocaleString(),
    }),
  },

  max_image_input_tokens: {
    color: 'yellow',
    description: 'Token budget consumed by image inputs.',
    icon: Image,
    key: 'max_image_input_tokens',
    label: 'Max Image Tokens',
    resolve: (endpoint) => ({
      active:
        endpoint.limits?.image_input_tokens !== undefined &&
        endpoint.limits.image_input_tokens !== null,
      value: endpoint.limits?.image_input_tokens?.toLocaleString(),
    }),
  },

  max_requests_per_minute: {
    color: 'yellow',
    description: 'Rate limit enforced by this endpoint.',
    icon: AlarmClock,
    key: 'max_requests_per_minute',
    label: 'Max Requests/Min',
    resolve: (endpoint) => ({
      active:
        endpoint.limits?.requests_per_minute !== undefined &&
        endpoint.limits.requests_per_minute !== null,
      value: endpoint.limits?.requests_per_minute?.toLocaleString(),
    }),
  },

  max_requests_per_day: {
    color: 'yellow',
    description: 'Daily request quota enforced by this endpoint.',
    icon: Calendar,
    key: 'max_requests_per_day',
    label: 'Max Requests/Day',
    resolve: (endpoint) => ({
      active:
        endpoint.limits?.requests_per_day !== undefined &&
        endpoint.limits.requests_per_day !== null,
      value: endpoint.limits?.requests_per_day?.toLocaleString(),
    }),
  },

  // Modalities
  image_input: {
    color: 'violet',
    description: 'Accepts images via URL or base64 content parts.',
    icon: ImageUp,
    key: 'image_input',
    label: 'Image Input',
    resolve: (endpoint) => {
      const active = endpoint.input_modalities?.includes('image') ?? false
      const items = []
      const imageInputPrice = endpoint.pricing?.image_input

      if (hasValue(imageInputPrice)) {
        items.push({
          label: 'Input',
          value: `${formatPrice(imageInputPrice, 3) ?? String(imageInputPrice)}/KTOK`,
        })
      }

      return {
        active,
        details: items.length > 0 ? items : undefined,
      }
    },
  },

  image_output: {
    color: 'violet',
    description: 'Generates images inline in the completion response.',
    icon: ImageDown,
    key: 'image_output',
    label: 'Image Output',
    resolve: (endpoint) => {
      const active = endpoint.output_modalities?.includes('image') ?? false
      const items = []
      const imageOutputPrice = endpoint.pricing?.image_output

      if (hasValue(imageOutputPrice)) {
        items.push({
          label: 'Output',
          value: `${formatPrice(imageOutputPrice, 3) ?? String(imageOutputPrice)}/KTOK`,
        })
      }

      return {
        active,
        details: items.length > 0 ? items : undefined,
      }
    },
  },

  text_output: {
    color: 'zinc',
    description: 'Returns text in the completion response.',
    icon: LetterText,
    key: 'text_output',
    label: 'Text Output',
    resolve: (endpoint) => ({
      active: endpoint.output_modalities?.includes('text') ?? false,
    }),
  },

  file_input: {
    color: 'sky',
    description: 'Accepts document and file uploads as input.',
    icon: FileSpreadsheet,
    key: 'file_input',
    label: 'File Input',
    resolve: (endpoint) => ({
      active: endpoint.input_modalities?.includes('file') ?? false,
    }),
  },

  audio_input: {
    color: 'fuchsia',
    description: 'Natively processes audio without a separate transcription step.',
    icon: AudioLines,
    key: 'audio_input',
    label: 'Audio Input',
    resolve: (endpoint) => {
      const active = endpoint.input_modalities?.includes('audio') ?? false
      const items = []
      const audioInputPrice = endpoint.pricing?.audio_input
      const audioCacheReadPrice = endpoint.pricing?.audio_cache_read

      if (hasValue(audioInputPrice)) {
        items.push({
          label: 'Input',
          value: `${formatPrice(audioInputPrice, 6) ?? String(audioInputPrice)}/MTOK`,
        })
      }

      if (hasValue(audioCacheReadPrice)) {
        items.push({
          label: 'Cache',
          value: `${formatPrice(audioCacheReadPrice, 6) ?? String(audioCacheReadPrice)}/MTOK`,
        })
      }

      return {
        active,
        details: items.length > 0 ? items : undefined,
      }
    },
  },

  audio_output: {
    color: 'fuchsia',
    description: 'Generates audio inline in the completion response.',
    icon: AudioLines,
    key: 'audio_output',
    label: 'Audio Output',
    resolve: (endpoint) => ({
      active: endpoint.output_modalities?.includes('audio') ?? false,
    }),
  },

  video_input: {
    color: 'emerald',
    description: 'Accepts video content via URL or base64.',
    icon: Video,
    key: 'video_input',
    label: 'Video Input',
    resolve: (endpoint) => ({
      active: endpoint.input_modalities?.includes('video') ?? false,
    }),
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

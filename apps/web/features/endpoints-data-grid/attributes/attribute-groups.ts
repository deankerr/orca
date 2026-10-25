import type { AttributeKey, AttributeSlots } from './attributes'

export const endpointModalityInputAttributes = [
  'image_input',
  'file_input',
  'audio_input',
  'video_input',
] as const

export const endpointModalityOutputAttributes = ['image_output', 'audio_output'] as const

export const endpointModalityAttributes = [
  'text_output',
  ...endpointModalityInputAttributes,
  ...endpointModalityOutputAttributes,
] as const

export type EndpointModalityAttribute = (typeof endpointModalityAttributes)[number]

export const endpointFilterAttributeGroups = {
  dataPolicy: ['training', 'data_publishing', 'user_id', 'data_retention'],
  features: [
    'reasoning',
    'tools',
    'response_format',
    'structured_outputs',
    'caching',
    'native_web_search',
    'moderated',
    'free',
    'completions',
    'chat_completions',
  ],
  status: ['gone', 'disabled', 'deranked'],
} satisfies Record<string, AttributeKey[]>

// data grid cells

export const endpointAttributeSets = {
  dataPolicy: [['training'], ['data_publishing'], ['user_id'], ['data_retention']],
  features: [
    ['reasoning'],
    ['tools'],
    ['structured_outputs', 'response_format'],
    ['caching'],
    ['native_web_search'],
    ['moderated'],
    ['free'],
  ],
  limits: [
    ['max_text_input_tokens'],
    ['max_image_input_tokens'],
    ['max_requests_per_minute'],
    ['max_requests_per_day'],
  ],
  modalities: [
    ['text_output'],
    ['image_input'],
    ['file_input'],
    ['audio_input'],
    ['video_input'],
    ['image_output'],
    ['audio_output'],
  ],
  status: [['gone', 'disabled', 'deranked']],
} satisfies Record<string, AttributeSlots>

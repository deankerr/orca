import type { AttributeKey, AttributeSlots } from './attributes'

export const endpointModalityInputAttributes = [
  'image_input',
  'file_input',
  'audio_input',
  'video_input',
] as const

export const endpointModalityOutputAttributes = [
  'image_output',
  'audio_output',
  'video_output',
  'embeddings_output',
] as const

export const endpointModalityAttributes = [
  'image_input',
  'file_input',
  'audio_input',
  'video_input',
  'image_output',
  'audio_output',
  'video_output',
  'embeddings_output',
] as const

export type EndpointModalityAttribute = (typeof endpointModalityAttributes)[number]

export const endpointFilterAttributeGroups = {
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
  dataPolicy: ['training', 'data_publishing', 'user_id', 'data_retention'],
} satisfies Record<string, AttributeKey[]>

// data grid cells

export const endpointAttributeSets = {
  status: [['gone', 'disabled', 'deranked']],
  modalities: [
    ['image_input'],
    ['file_input'],
    ['audio_input'],
    ['video_input'],
    ['image_output'],
    ['audio_output'],
    ['video_output'],
    ['embeddings_output'],
  ],
  features: [
    ['reasoning'],
    ['tools'],
    ['structured_outputs', 'response_format'],
    ['implicit_caching', 'caching'],
    ['native_web_search'],
    ['moderated'],
    ['free'],
  ],
  miscPricing: [['long_context_pricing']],
  dataPolicy: [['training'], ['data_publishing'], ['user_id'], ['data_retention']],
  limits: [
    ['max_text_input_tokens'],
    ['max_image_input_tokens'],
    ['max_images_per_input'],
    ['max_requests_per_minute'],
    ['max_requests_per_day'],
  ],
} satisfies Record<string, AttributeSlots>

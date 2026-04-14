import { omit } from 'remeda'

import type { Doc } from '../../_generated/dataModel'

type EndpointDoc = Doc<'or_views_endpoints'>

function createPricingProjection(pricing: EndpointDoc['pricing']) {
  return {
    ...omit(pricing, [
      'internal_reasoning',
      'audio_cache_input',
      'cache_read',
      'cache_write',
      'request',
    ]),
    reasoning_output: pricing.internal_reasoning,
    audio_cache_write: pricing.audio_cache_input,
    text_cache_read: pricing.cache_read,
    text_cache_write: pricing.cache_write,
  }
}

function createDataPolicyProjection(dataPolicy: EndpointDoc['data_policy']) {
  return {
    may_train_on_data: dataPolicy.training,
    may_publish_data: dataPolicy.can_publish,
    shares_user_id: dataPolicy.requires_user_ids,
    may_retain_data: dataPolicy.retains_prompts,
    data_retention_days: dataPolicy.retains_prompts_days,
  }
}

function createLimitsProjection(limits: EndpointDoc['limits']) {
  return omit(limits, ['text_output_tokens'])
}

export function createEndpointProjection(doc: EndpointDoc) {
  return {
    ...omit(doc, [
      'model',
      'provider',
      'pricing',
      'data_policy',
      'limits',
      'stream_cancellation',
      'file_urls',
      'multipart',
      'status',
      'mandatory_reasoning',
    ]),
    model: omit(doc.model, ['icon_url']),
    provider: omit(doc.provider, ['icon_url']),
    pricing: createPricingProjection(doc.pricing),
    data_policy: createDataPolicyProjection(doc.data_policy),
    limits: createLimitsProjection(doc.limits),
    max_output: doc.limits.text_output_tokens ?? doc.context_length,
  }
}

export function createEndpointProjections(docs: EndpointDoc[]) {
  return docs.map(createEndpointProjection)
}

export type EndpointProjection = ReturnType<typeof createEndpointProjection>

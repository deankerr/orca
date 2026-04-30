import { query } from '../_generated/server'
import { endpoints } from '../catalog/endpoints'

type EndpointListItem = Awaited<ReturnType<(typeof endpoints.list)['handler']>>[number]

const COMPAT_PLACEHOLDER = {
  modelAuthorName: '[compat placeholder: model author unavailable]',
  modelAuthorSlug: '[compat-placeholder-model-author]',
  modelBaseSlug: '[compat-placeholder-model-base]',
  providerModelId: '[compat placeholder: provider model id unavailable]',
} as const

function getProviderTagSlug(endpoint: EndpointListItem) {
  if (endpoint.providerVariant === undefined) {
    return endpoint.providerId
  }

  return `${endpoint.providerId}/${endpoint.providerVariant}`
}

function getCompatStats(endpoint: EndpointListItem) {
  const throughput = endpoint.stats?.p50Throughput
  const latency = endpoint.stats?.p50Latency

  if (throughput === undefined || latency === undefined) {
    return undefined
  }

  return {
    p50_latency: latency,
    p50_throughput: throughput,
  }
}

export function toCompatEndpoint(endpoint: EndpointListItem) {
  const maxOutput = endpoint.maxOutput ?? endpoint.contextLength
  const providerTagSlug = getProviderTagSlug(endpoint)

  return {
    _creationTime: endpoint._creationTime,
    _id: endpoint._id,
    uuid: endpoint.id,

    // Map model fields to the existing endpoint grid projection shape.
    model: {
      author_name: COMPAT_PLACEHOLDER.modelAuthorName,
      author_slug: COMPAT_PLACEHOLDER.modelAuthorSlug,
      base_slug: COMPAT_PLACEHOLDER.modelBaseSlug,
      input_modalities: endpoint.inputModalities,
      name: endpoint.modelName,
      or_added_at: endpoint.modelCreatedAt,
      output_modalities: endpoint.outputModalities,
      reasoning: endpoint.reasoning,
      slug: endpoint.modelId,
      variant: endpoint.modelVariant,
      version_slug: endpoint.modelVersionId,
    },

    // Map provider fields to the existing endpoint grid projection shape.
    provider: {
      model_id: COMPAT_PLACEHOLDER.providerModelId,
      name: endpoint.providerName,
      region: endpoint.providerRegion,
      slug: endpoint.providerId,
      tag_slug: providerTagSlug,
    },

    // Preserve the old data policy casing expected by shared attribute renderers.
    data_policy: {
      data_retention_days: endpoint.dataPolicy.dataRetentionDays,
      may_publish_data: endpoint.dataPolicy.mayPublishData,
      may_retain_data: endpoint.dataPolicy.mayRetainData,
      may_train_on_data: endpoint.dataPolicy.mayTrainOnData,
      shares_user_id: endpoint.dataPolicy.sharesUserId,
    },

    // Preserve the old pricing casing expected by shared formatters and badges.
    pricing: {
      audio_cache_write: endpoint.pricing.audioCacheWrite,
      audio_input: endpoint.pricing.audioInput,
      discount: endpoint.pricing.discount,
      image_input: endpoint.pricing.imageInput,
      image_output: endpoint.pricing.imageOutput,
      reasoning_output: endpoint.pricing.reasoningOutput,
      text_cache_read: endpoint.pricing.textCacheRead,
      text_cache_write: endpoint.pricing.textCacheWrite,
      text_input: endpoint.pricing.textInput,
      text_output: endpoint.pricing.textOutput,
      web_search: endpoint.pricing.webSearch,
    },

    // Pricing tiers are not implemented in backend-experimental yet.
    variable_pricings: [],

    // Preserve the old limits casing; images_per_input is not collected yet.
    limits: {
      image_input_tokens: endpoint.limits.imageInputTokens,
      images_per_input: undefined,
      requests_per_day: endpoint.limits.requestsPerDay,
      requests_per_minute: endpoint.limits.requestsPerMinute,
      text_input_tokens: endpoint.limits.textInputTokens,
    },

    // Preserve endpoint configuration fields consumed by the grid.
    context_length: endpoint.contextLength,
    max_output: maxOutput,
    quantization: endpoint.quantization,
    supported_parameters: endpoint.supportedParameters,

    // Flatten capabilities and flags back to the current production names.
    chat_completions: endpoint.capabilities.chatCompletions,
    completions: endpoint.capabilities.completions,
    deranked: endpoint.flags.deranked,
    disabled: endpoint.flags.disabled,
    implicit_caching: endpoint.capabilities.implicitCaching,
    moderated: endpoint.flags.moderated,
    native_web_search: endpoint.capabilities.nativeWebSearch,

    // Use the view creation time as the best available compat update timestamp.
    stats: getCompatStats(endpoint),
    unavailable_at: endpoint.unavailableAt,
    updated_at: endpoint._creationTime,
  }
}

export const list = query({
  args: endpoints.list.args,
  handler: async (ctx, args) => {
    const results = await endpoints.list.handler(ctx, args)
    return results.map(toCompatEndpoint)
  },
})

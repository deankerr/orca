import { v } from 'convex/values'

import { db } from '@/convex/db'

import { internalMutation, internalQuery } from '../_generated/server'

export const run = internalMutation({
  args: { excludeUnavailable: v.boolean() },
  handler: async (ctx, { excludeUnavailable }) => {
    const allEndpoints = await db.or.views.endpoints.collect(ctx)
    const availableEndpoints = allEndpoints.filter((endp) => endp.unavailable_at === undefined)

    const endpoints = excludeUnavailable ? availableEndpoints : allEndpoints
    const total = endpoints.length

    if (total === 0) return 'no endpoints found'

    // Helper function to calculate percentage
    const pct = (count: number) => Math.round((count / total) * 100 * 100) / 100

    // Count input modalities
    const inputModalities: Record<string, { count: number; percentage: number }> = {}
    endpoints.forEach((ep) => {
      ep.model.input_modalities.forEach((modality) => {
        inputModalities[modality] = inputModalities[modality] || { count: 0, percentage: 0 }
        inputModalities[modality].count++
      })
    })
    Object.keys(inputModalities).forEach((key) => {
      inputModalities[key].percentage = pct(inputModalities[key].count)
    })

    // Count output modalities
    const outputModalities: Record<string, { count: number; percentage: number }> = {}
    endpoints.forEach((ep) => {
      ep.model.output_modalities.forEach((modality) => {
        outputModalities[modality] = outputModalities[modality] || { count: 0, percentage: 0 }
        outputModalities[modality].count++
      })
    })
    Object.keys(outputModalities).forEach((key) => {
      outputModalities[key].percentage = pct(outputModalities[key].count)
    })

    // Count boolean model properties
    const modelBooleans = {
      reasoning: { count: 0, percentage: 0 },
      mandatory_reasoning: { count: 0, percentage: 0 },
    }
    endpoints.forEach((ep) => {
      if (ep.model.reasoning) modelBooleans.reasoning.count++
    })
    Object.keys(modelBooleans).forEach((key) => {
      modelBooleans[key as keyof typeof modelBooleans].percentage = pct(
        modelBooleans[key as keyof typeof modelBooleans].count,
      )
    })

    // Count pricing field presence
    const pricingFields = {
      text_input: { count: 0, percentage: 0 },
      text_output: { count: 0, percentage: 0 },
      internal_reasoning: { count: 0, percentage: 0 },
      audio_input: { count: 0, percentage: 0 },
      audio_cache_input: { count: 0, percentage: 0 },
      cache_read: { count: 0, percentage: 0 },
      cache_write: { count: 0, percentage: 0 },
      image_input: { count: 0, percentage: 0 },
      image_output: { count: 0, percentage: 0 },
      request: { count: 0, percentage: 0 },
      web_search: { count: 0, percentage: 0 },
      discount: { count: 0, percentage: 0 },
    }
    endpoints.forEach((ep) => {
      Object.keys(pricingFields).forEach((field) => {
        if (ep.pricing[field as keyof typeof ep.pricing] != null) {
          pricingFields[field as keyof typeof pricingFields].count++
        }
      })
    })
    Object.keys(pricingFields).forEach((key) => {
      pricingFields[key as keyof typeof pricingFields].percentage = pct(
        pricingFields[key as keyof typeof pricingFields].count,
      )
    })

    // Count limits field presence
    const limitsFields = {
      text_input_tokens: { count: 0, percentage: 0 },
      text_output_tokens: { count: 0, percentage: 0 },
      image_input_tokens: { count: 0, percentage: 0 },
      images_per_input: { count: 0, percentage: 0 },
      requests_per_minute: { count: 0, percentage: 0 },
      requests_per_day: { count: 0, percentage: 0 },
    }
    endpoints.forEach((ep) => {
      Object.keys(limitsFields).forEach((field) => {
        if (ep.limits[field as keyof typeof ep.limits] != null) {
          limitsFields[field as keyof typeof limitsFields].count++
        }
      })
    })
    Object.keys(limitsFields).forEach((key) => {
      limitsFields[key as keyof typeof limitsFields].percentage = pct(
        limitsFields[key as keyof typeof limitsFields].count,
      )
    })

    // Count data policy field presence
    const dataPolicyFields = {
      training: { count: 0, percentage: 0 },
      can_publish: { count: 0, percentage: 0 },
      requires_user_ids: { count: 0, percentage: 0 },
      retains_prompts: { count: 0, percentage: 0 },
      retains_prompts_days: { count: 0, percentage: 0 },
    }
    endpoints.forEach((ep) => {
      Object.keys(dataPolicyFields).forEach((field) => {
        const value = ep.data_policy[field as keyof typeof ep.data_policy]
        if (value === true || (typeof value === 'number' && value > 0)) {
          dataPolicyFields[field as keyof typeof dataPolicyFields].count++
        }
      })
    })
    Object.keys(dataPolicyFields).forEach((key) => {
      dataPolicyFields[key as keyof typeof dataPolicyFields].percentage = pct(
        dataPolicyFields[key as keyof typeof dataPolicyFields].count,
      )
    })

    // Count endpoint capability booleans
    const endpointBooleans = {
      completions: { count: 0, percentage: 0 },
      chat_completions: { count: 0, percentage: 0 },
      stream_cancellation: { count: 0, percentage: 0 },
      implicit_caching: { count: 0, percentage: 0 },
      file_urls: { count: 0, percentage: 0 },
      native_web_search: { count: 0, percentage: 0 },
      multipart: { count: 0, percentage: 0 },
      moderated: { count: 0, percentage: 0 },
      mandatory_reasoning: { count: 0, percentage: 0 },
      deranked: { count: 0, percentage: 0 },
      disabled: { count: 0, percentage: 0 },
    }
    endpoints.forEach((ep) => {
      Object.keys(endpointBooleans).forEach((field) => {
        if (ep[field as keyof typeof ep]) {
          endpointBooleans[field as keyof typeof endpointBooleans].count++
        }
      })
    })
    Object.keys(endpointBooleans).forEach((key) => {
      endpointBooleans[key as keyof typeof endpointBooleans].percentage = pct(
        endpointBooleans[key as keyof typeof endpointBooleans].count,
      )
    })

    // Count other field presence
    const otherFields = {
      quantization: { count: 0, percentage: 0 },
      unavailable_at: { count: 0, percentage: 0 },
    }
    endpoints.forEach((ep) => {
      if (ep.quantization != null) otherFields.quantization.count++
      if (ep.unavailable_at != null) otherFields.unavailable_at.count++
    })
    Object.keys(otherFields).forEach((key) => {
      otherFields[key as keyof typeof otherFields].percentage = pct(
        otherFields[key as keyof typeof otherFields].count,
      )
    })

    const report = {
      total_endpoints: total,
      input_modalities: inputModalities,
      output_modalities: outputModalities,
      model_capabilities: modelBooleans,
      pricing_fields: pricingFields,
      limits_fields: limitsFields,
      data_policy_fields: dataPolicyFields,
      endpoint_capabilities: endpointBooleans,
      other_fields: otherFields,
    }

    return report
  },
})

// Endpoints with web search capabilities: has web_search pricing and/or native_web_search is true
export const nativeWebSearch = internalQuery({
  args: {},
  handler: async (ctx) => {
    const allEndpoints = await db.or.views.endpoints.collect(ctx)

    return allEndpoints
      .filter((ep) => ep.unavailable_at === undefined)
      .filter((ep) => ep.pricing.web_search != null || ep.native_web_search)
      .map((ep) => ({
        model_slug: ep.model.slug,
        provider_slug: ep.provider.tag_slug,
        native_web_search: ep.native_web_search,
        web_search_pricing: ep.pricing.web_search ?? null,
      }))
      .sort((a, b) => a.model_slug.localeCompare(b.model_slug))
  },
})

import { defineTable } from 'convex/server'
import { v } from 'convex/values'

// Entity State

export const stateTable = defineTable({
  contentHash: v.string(),
  entity: v.object({
    id: v.string(),
    label: v.string(),
    modelId: v.string(),
    providerId: v.string(),
  }),
  observedAt: v.number(),
  rowId: v.id('catalog_endpoints_content'),
  unavailableAt: v.optional(v.number()),
}).index('by_entity_id__observedAt', ['entity.id', 'observedAt'])

const identityFields = {
  id: v.string(),
  modelId: v.string(),
  providerId: v.string(),
}

// Content

export const contentFields = {
  ...identityFields,
  modelVariant: v.string(),
  modelVersionId: v.string(),
  providerName: v.string(),
  providerRegion: v.optional(v.string()),
  providerVariant: v.optional(v.string()),

  contextLength: v.number(),
  maxOutput: v.optional(v.number()),
  quantization: v.string(),
  supportedParameters: v.array(v.string()),

  pricing: v.object({
    audioCacheWrite: v.optional(v.number()),
    audioInput: v.optional(v.number()),
    discount: v.optional(v.number()),
    imageInput: v.optional(v.number()),
    imageOutput: v.optional(v.number()),
    perRequest: v.optional(v.number()),
    reasoningOutput: v.optional(v.number()),
    textCacheRead: v.optional(v.number()),
    textCacheWrite: v.optional(v.number()),
    textInput: v.optional(v.number()),
    textOutput: v.optional(v.number()),
    webSearch: v.optional(v.number()),
  }),

  dataPolicy: v.object({
    dataRetentionDays: v.optional(v.number()),
    mayPublishData: v.optional(v.boolean()),
    mayRetainData: v.optional(v.boolean()),
    mayTrainOnData: v.optional(v.boolean()),
    sharesUserId: v.optional(v.boolean()),
  }),

  limits: v.object({
    imageInputTokens: v.optional(v.number()),
    requestsPerDay: v.optional(v.number()),
    requestsPerMinute: v.optional(v.number()),
    textInputTokens: v.optional(v.number()),
  }),

  capabilities: v.object({
    chatCompletions: v.boolean(),
    completions: v.boolean(),
    implicitCaching: v.boolean(),
    nativeWebSearch: v.boolean(),
  }),

  flags: v.object({
    deranked: v.boolean(),
    disabled: v.boolean(),
    moderated: v.boolean(),
  }),
}

export const contentTable = defineTable(contentFields)

import { defineTable } from 'convex/server'
import { v } from 'convex/values'

const identityFields = {
  id: v.string(),
}

const componentStateFields = {
  coreVersion: v.number(),
  coreContentHash: v.string(),
  pricingVersion: v.number(),
  pricingContentHash: v.string(),
}

// Entity State

export const stateFields = {
  ...identityFields,
  modelId: v.string(),
  ...componentStateFields,
  firstSeenAt: v.number(),
  version: v.number(),
  unavailableAt: v.optional(v.number()),
}

export const stateTable = defineTable(stateFields)
  .index('by_id__version', ['id', 'version'])
  .index('by_id__firstSeenAt', ['id', 'firstSeenAt'])
  .index('by_unavailableAt', ['unavailableAt'])

const componentIdentityFields = {
  ...identityFields,
  modelId: v.string(),
  providerId: v.string(),
}

// Core Component

export const coreContentFields = {
  ...componentIdentityFields,
  modelVersionId: v.string(),
  modelVariant: v.string(),
  providerVariant: v.optional(v.string()),
  providerName: v.string(),
  providerRegion: v.optional(v.string()),

  contextLength: v.number(),
  maxOutput: v.optional(v.number()),
  quantization: v.string(),
  supportedParameters: v.array(v.string()),

  dataPolicy: v.object({
    mayTrainOnData: v.optional(v.boolean()),
    mayPublishData: v.optional(v.boolean()),
    sharesUserId: v.optional(v.boolean()),
    mayRetainData: v.optional(v.boolean()),
    dataRetentionDays: v.optional(v.number()),
  }),

  limits: v.object({
    textInputTokens: v.optional(v.number()),
    imageInputTokens: v.optional(v.number()),
    requestsPerMinute: v.optional(v.number()),
    requestsPerDay: v.optional(v.number()),
  }),

  capabilities: v.object({
    completions: v.boolean(),
    chatCompletions: v.boolean(),
    implicitCaching: v.boolean(),
    nativeWebSearch: v.boolean(),
  }),

  flags: v.object({
    moderated: v.boolean(),
    deranked: v.boolean(),
    disabled: v.boolean(),
  }),
}

export const coreTable = defineTable({
  ...coreContentFields,
  firstSeenAt: v.number(),
  version: v.number(),
  contentHash: v.string(),
})
  .index('by_id__firstSeenAt', ['id', 'firstSeenAt'])
  .index('by_id__version', ['id', 'version'])

// Pricing Component

export const pricingContentFields = {
  ...componentIdentityFields,
  textInput: v.optional(v.number()),
  textOutput: v.optional(v.number()),
  reasoningOutput: v.optional(v.number()),
  audioInput: v.optional(v.number()),
  audioCacheWrite: v.optional(v.number()),
  textCacheRead: v.optional(v.number()),
  textCacheWrite: v.optional(v.number()),
  imageInput: v.optional(v.number()),
  imageOutput: v.optional(v.number()),
  perRequest: v.optional(v.number()),
  webSearch: v.optional(v.number()),
  discount: v.optional(v.number()),
}

export const pricingTable = defineTable({
  ...pricingContentFields,
  firstSeenAt: v.number(),
  version: v.number(),
  contentHash: v.string(),
})
  .index('by_id__firstSeenAt', ['id', 'firstSeenAt'])
  .index('by_id__version', ['id', 'version'])

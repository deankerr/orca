import { z } from 'zod'

const ProviderDataPolicySchema = z.looseObject({
  canPublish: z.boolean(),
  privacyPolicyURL: z.url().optional(),
  requiresUserIDs: z.boolean().optional(),
  retainsPrompts: z.boolean(),
  retentionDays: z.number().int().nonnegative().optional(),
  termsOfServiceURL: z.url().optional(),
  training: z.boolean(),
  trainingOpenRouter: z.boolean(),
})

export const ProviderInfoSchema = z.looseObject({
  adapterName: z.string(),
  baseUrl: z.string(),
  byokEnabled: z.boolean(),
  dataPolicy: ProviderDataPolicySchema,
  datacenters: z.array(z.string()).optional(),
  displayName: z.string(),
  hasChatCompletions: z.boolean(),
  hasCompletions: z.boolean(),
  headquarters: z.string().optional(),
  icon: z.looseObject({
    className: z.string().optional(),
    darkUrl: z.string().optional(),
    url: z.string(),
  }),
  isAbortable: z.boolean(),
  moderationRequired: z.boolean(),
  name: z.string(),
  pricingStrategy: z.string(),
  sendClientIp: z.boolean(),
  slug: z.string(),
  statusPageUrl: z.url().nullable(),
})

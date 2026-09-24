import { z } from 'zod'

/** Required model facts; all remaining JSON survives for later interpretation. */
export const SourceModel = z
  .object({
    slug: z.string(),
    permaslug: z.string(),
    input_modalities: z.array(z.string()),
    output_modalities: z.array(z.string()),
    short_name: z.string(),
    created_at: z.string(),
  })
  .catchall(z.json())

/** Provider object selected from `provider_info`. */
export const SourceProvider = z
  .object({
    slug: z.string(),
    displayName: z.string(),
  })
  .catchall(z.json())

/** Model observation, including scan-derived identity and variant absent from the source body. */
export const StoredModel = z.object({
  model_id: z.string(),
  variant: z.string(),
  model: SourceModel,
})

/** Source pricing object. Product pricing selection belongs to Projections. */
export const SourcePricing = z
  .object({
    discount: z.number(),
    overrides: z.array(z.record(z.string(), z.json())).optional(),
  })
  .catchall(z.json())

/** Endpoint observation after Scan has removed related bodies and renamed its accessor. */
export const EndpointValue = z
  .object({
    id: z.string().min(1),
    variant: z.string().min(1),
    provider_tag: z.string().min(1),
    pricing: SourcePricing,
  })
  .catchall(z.json())

export type EndpointValue = z.infer<typeof EndpointValue>

export type SourceModel = z.infer<typeof SourceModel>
export type SourceProvider = z.infer<typeof SourceProvider>
export type StoredModel = z.infer<typeof StoredModel>
export type SourcePricing = z.infer<typeof SourcePricing>

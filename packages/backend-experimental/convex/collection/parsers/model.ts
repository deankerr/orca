import * as R from 'remeda'
import { z } from 'zod'

// Drop nullish values so version hashes only reflect meaningful payload changes.
function compact<T extends Record<string, unknown>>(value: T) {
  return R.pickBy(value, R.isNonNullish)
}

// Normalize one raw model payload into the independent model streams we store.
export const rawModelTransformSchema = z
  .object({
    slug: z.string(),
    hf_slug: z.string().nullable(),
    created_at: z
      .string()
      .transform((value) => Date.parse(value))
      .pipe(z.number()),
    short_name: z.string(),
    description: z.string(),
    author: z.string(),
    author_display_name: z.string().optional(),
    context_length: z.number(),
    input_modalities: z.array(z.string()).transform((value) => value.toSorted()),
    output_modalities: z.array(z.string()).transform((value) => value.toSorted()),
    promotion_message: z.string().nullable(),
    warning_message: z.string().nullable(),
    routing_error_message: z.string().nullable(),
    permaslug: z.string(),
    endpoint: z
      .object({
        variant: z.string(),
      })
      .nullish(),
    supports_reasoning: z.boolean(),
  })
  .transform((raw) => {
    const variant = raw.endpoint?.variant ?? 'standard'
    const id = variant === 'standard' ? raw.slug : `${raw.slug}:${variant}`
    const name = raw.short_name

    const content = compact({
      id,
      versionId: raw.permaslug,
      variant,
      name,
      authorId: raw.author,
      authorName: raw.author_display_name ?? raw.author,
      orAddedAt: raw.created_at,
      inputModalities: raw.input_modalities,
      outputModalities: raw.output_modalities,
      reasoning: raw.supports_reasoning,
      huggingFaceId: raw.hf_slug,
      description: raw.description,
      promotionMessage: raw.promotion_message,
      warningMessage: raw.warning_message,
      routingErrorMessage: raw.routing_error_message,
    })

    return {
      entity: {
        id,
        label: name,
      },
      content,
    }
  })

// Model identity and endpoint selectors are stable enough to gate the whole workflow.
export const rawModelIdentitySchema = z
  .looseObject({
    slug: z.string(),
    permaslug: z.string(),
    endpoint: z
      .object({
        variant: z.string(),
      })
      .nullish(),
  })
  .transform((raw) => {
    const variant = raw.endpoint?.variant ?? 'standard'
    const id = variant === 'standard' ? raw.slug : `${raw.slug}:${variant}`

    return {
      id,
      rawModel: raw,
      endpoint:
        raw.endpoint === null || raw.endpoint === undefined
          ? null
          : {
              permaslug: raw.permaslug,
              variant: raw.endpoint.variant,
            },
    }
  })

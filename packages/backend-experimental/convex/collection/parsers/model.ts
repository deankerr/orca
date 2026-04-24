import * as R from 'remeda'
import { z } from 'zod'

// Drop nullish values so version hashes only reflect meaningful payload changes.
function compact<T extends Record<string, unknown>>(value: T) {
  return R.pickBy(value, R.isNonNullish)
}

// Normalize one raw model payload into the independent model streams we store.
export const rawModelTransformSchema = z
  .object({
    permaslug: z.string(),
    slug: z.string(),

    author: z.string(),
    author_display_name: z.string().optional(),
    short_name: z.string(),

    created_at: z
      .string()
      .transform((value) => Date.parse(value))
      .pipe(z.number()),

    input_modalities: z.array(z.string()).transform((value) => value.toSorted()),
    output_modalities: z.array(z.string()).transform((value) => value.toSorted()),

    description: z.string(),
    hf_slug: z.string().nullable(),
    promotion_message: z.string().nullable(),
    routing_error_message: z.string().nullable(),
    warning_message: z.string().nullable(),

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
      variant,
      versionId: raw.permaslug,

      authorId: raw.author,
      authorName: raw.author_display_name ?? raw.author,
      name,

      orAddedAt: raw.created_at,

      inputModalities: raw.input_modalities,
      outputModalities: raw.output_modalities,

      reasoning: raw.supports_reasoning,

      description: raw.description,
      huggingFaceId: raw.hf_slug,
      promotionMessage: raw.promotion_message,
      routingErrorMessage: raw.routing_error_message,
      warningMessage: raw.warning_message,
    })

    return {
      content,
      entity: {
        id,
        label: name,
      },
    }
  })

// Model identity and endpoint selectors are stable enough to gate the whole workflow.
export const rawModelIdentitySchema = z
  .looseObject({
    endpoint: z
      .object({
        variant: z.string(),
      })
      .nullish(),
    permaslug: z.string(),
    slug: z.string(),
  })
  .transform((raw) => {
    const variant = raw.endpoint?.variant ?? 'standard'
    const id = variant === 'standard' ? raw.slug : `${raw.slug}:${variant}`

    return {
      endpoint:
        raw.endpoint === null || raw.endpoint === undefined
          ? null
          : {
              permaslug: raw.permaslug,
              variant: raw.endpoint.variant,
            },
      id,
      rawModel: raw,
    }
  })

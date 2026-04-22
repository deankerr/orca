import * as R from 'remeda'
import { z } from 'zod'

// Drop nullish values so version hashes only reflect meaningful payload changes.
function compact<T extends Record<string, unknown>>(value: T) {
  return R.pickBy(value, R.isNonNullish)
}

// Normalize one raw model payload into the independent model streams we store.
const rawModelSchema = z
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
      .nullable(),
    supports_reasoning: z.boolean(),
  })
  .transform((raw) => {
    const variant = raw.endpoint?.variant ?? 'standard'
    const id = variant === 'standard' ? raw.slug : `${raw.slug}:${variant}`

    const core = compact({
      id,
      versionId: raw.permaslug,
      variant,
      name: raw.short_name,
      authorId: raw.author,
      authorName: raw.author_display_name ?? raw.author,
      orAddedAt: raw.created_at,
      inputModalities: raw.input_modalities,
      outputModalities: raw.output_modalities,
      reasoning: raw.supports_reasoning,
      huggingFaceId: raw.hf_slug,
      promotionMessage: raw.promotion_message,
      warningMessage: raw.warning_message,
      routingErrorMessage: raw.routing_error_message,
    })

    const description = {
      id,
      description: raw.description,
    }

    return {
      id,
      core,
      description,
    }
  })

// Model identity and endpoint selectors are stable enough to gate the whole workflow.
const rawModelIdentitySchema = z
  .object({
    slug: z.string(),
    permaslug: z.string(),
    endpoint: z
      .object({
        variant: z.string(),
      })
      .nullable(),
  })
  .transform((raw) => {
    const variant = raw.endpoint?.variant ?? 'standard'
    const id = variant === 'standard' ? raw.slug : `${raw.slug}:${variant}`

    return {
      id,
      endpoint:
        raw.endpoint === null
          ? null
          : {
              permaslug: raw.permaslug,
              variant: raw.endpoint.variant,
            },
    }
  })

export function parseModelBundle(args: { item: Record<string, unknown> }) {
  return rawModelSchema.parse(args.item)
}

export function parseModelIdentity(args: { item: Record<string, unknown> }) {
  return rawModelIdentitySchema.parse(args.item)
}

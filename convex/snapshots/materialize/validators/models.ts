import { z } from 'zod'

export const ModelTransformSchema = z
  .object({
    slug: z.string(),
    hf_slug: z.string().nullish(),
    created_at: z
      .string()
      .transform((val) => Date.parse(val))
      .pipe(z.number()),
    name: z.string(),
    short_name: z.string(),
    author: z.string(),
    context_length: z.number(),
    input_modalities: z.array(z.string()).transform((arr) => arr.sort()),
    output_modalities: z.array(z.string()).transform((arr) => arr.sort()),
    group: z.string().nullish(),
    instruct_type: z.string().nullish(),
    promotion_message: z.string().nullish(),
    warning_message: z.string().nullish(),
    permaslug: z.string(),
    reasoning_config: z.record(z.string(), z.unknown()).nullish(),
    // only available in some contexts
    endpoint: z
      .object({
        variant: z.string(),
      })
      .nullish(),
  })
  .transform((raw) => {
    // add variant suffix if available
    let slug = raw.slug
    if (raw.endpoint?.variant && raw.endpoint.variant !== 'standard') {
      slug += `:${raw.endpoint.variant}`
    }

    // Extract author name from model name if it contains a colon, otherwise use author slug
    const author_name = raw.name.includes(':') ? raw.name.split(':')[0].trim() : raw.author

    return {
      slug,
      base_slug: raw.slug,
      version_slug: raw.permaslug,
      variant: raw.endpoint?.variant ?? 'standard',

      name: raw.short_name,
      icon_url: '', // deprecated

      author_slug: raw.author,
      author_name,

      or_added_at: raw.created_at,

      input_modalities: raw.input_modalities,
      output_modalities: raw.output_modalities,

      reasoning: raw.reasoning_config !== null,

      // details
      tokenizer: raw.group || undefined,
      hugging_face_id: raw.hf_slug || undefined,
      instruct_type: raw.instruct_type || undefined,
      promotion_message: raw.promotion_message || undefined,
      warning_message: raw.warning_message || undefined,
    }
  })

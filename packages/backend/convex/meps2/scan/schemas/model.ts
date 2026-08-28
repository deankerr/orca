import { z } from 'zod'

import { flattenMetadata } from './shared'

// [model_id] and [variant] are lifted to the catalog item; after scan, `endpoint` is
// overwritten to the top endpoint UUID (or null) so the nested record is not stored.
export const Model = z
  .looseObject({
    slug: z.string(),
    permaslug: z.string(),

    input_modalities: z.string().array(),
    output_modalities: z.string().array(),
    created_at: z.iso.datetime({ offset: true }), // [or_created_at]

    name: z.string(), // [display_name]
    author_display_name: z.string(),

    endpoint: z
      .looseObject({
        id: z.string(),
        model_variant_slug: z.string(),
        variant: z.string(),
      })
      .nullable(),
  })
  .transform((raw) => {
    // core fields become table columns, everything else is flattened into metadata
    const {
      slug,
      endpoint,

      permaslug,
      input_modalities,
      output_modalities,
      created_at,
      name,
      author_display_name,
      ...rest
    } = raw

    return {
      slug,
      endpoint,

      permaslug,
      input_modalities,
      output_modalities,
      or_created_at: created_at,

      display_name: name,
      author_display_name,

      metadata: flattenMetadata(rest),
    }
  })

export type ModelRow = z.output<typeof Model>

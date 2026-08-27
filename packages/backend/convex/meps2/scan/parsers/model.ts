import { z } from 'zod'

import { flattenMetadata } from './shared'

// [model_id] and [variant] are not derivable from the record: scanCatalog lifts them
// to the bundle item level, and `endpoint` on the record is the top endpoint's UUID
export const Model = z
  .looseObject({
    slug: z.string(),
    permaslug: z.string(),

    input_modalities: z.string().array(),
    output_modalities: z.string().array(),
    created_at: z.iso.datetime({ offset: true }), // [or_created_at]

    name: z.string(), // [display_name]
    author_display_name: z.string(),
  })
  .transform((raw) => {
    // core fields become table columns, everything else is flattened into metadata
    const {
      permaslug,
      input_modalities,
      output_modalities,
      created_at,
      name,
      author_display_name,
      ...rest
    } = raw

    return {
      permaslug,
      input_modalities,
      output_modalities,
      or_created_at: created_at,

      display_name: name,
      author_display_name,

      metadata: flattenMetadata(rest),
    }
  })

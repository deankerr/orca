import { z } from 'zod'

import { flattenMetadata } from '../metadata'
import type { CatalogModel } from '../v1'

export const Model = z
  .looseObject({
    slug: z.string(),
    permaslug: z.string(),

    input_modalities: z.string().array(),
    output_modalities: z.string().array(),
    created_at: z.iso.datetime({ offset: true }),

    name: z.string(),
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

    const model: CatalogModel = {
      model_id: endpoint?.model_variant_slug ?? slug,
      variant: endpoint?.variant ?? 'standard',
      slug,
      permaslug,
      input_modalities,
      output_modalities,
      or_created_at: created_at,
      display_name: name,
      author_display_name,
      metadata: flattenMetadata(rest),
    }

    return {
      model,
      has_endpoints: endpoint !== null,
    }
  })

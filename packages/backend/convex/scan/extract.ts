import { z } from 'zod'

import type { RawScan } from './collected'
import { ScannedEndpoint, ScannedModel } from './schema'
import type { Scan } from './schema'

const ProviderBody = z.object({ slug: z.string() }).catchall(z.json())

/** Apply product scope before assembling providers from embedded observations. */
function hasTextModalities(model: RawScan['entries'][number]['model']): boolean {
  return model.input_modalities.includes('text') && model.output_modalities.includes('text')
}

/** Assemble entities by identity, preserving source facts for downstream consumers. */
export function extract({ scan_at, entries }: RawScan): Scan {
  const models: Scan['models'] = new Map()
  const providers: Scan['providers'] = new Map()
  const endpoints: Scan['endpoints'] = new Map()

  for (const entry of entries) {
    // Lyria music models report text input/output because they also return lyrics.
    if (entry.model_id.startsWith('google/lyria') || !hasTextModalities(entry.model)) {
      continue
    }

    models.set(
      entry.model_id,
      ScannedModel.parse({ ...entry.model, id: entry.model_id, variant: entry.variant }),
    )

    // `status` is noisy and meaningless; dropping it here keeps it out of every consumer.
    for (const { provider_info, provider_slug, status: _status, ...body } of entry.endpoints ??
      []) {
      const { slug: provider_id, ...provider } = ProviderBody.parse(provider_info)
      providers.set(provider_id, { ...provider, provider_id })

      endpoints.set(
        body.id,
        ScannedEndpoint.parse({
          ...body,
          variant: entry.variant,
          model_id: entry.model_id,
          provider_id,
          provider_tag: provider_slug,
        }),
      )
    }
  }

  return { scan_at, models, providers, endpoints }
}

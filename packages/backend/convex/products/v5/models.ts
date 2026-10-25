import { Model } from '@orca/contract/model'
import { z } from 'zod'

import type { CurrentModelRow } from '../../catalog/tables/current'
import { flagOrNull, isoDate, stringsOrNull, textOrNull } from '../../fields'
import { JsonObjectFromString } from '../../json'

const Metadata = JsonObjectFromString.pipe(
  z.object({
    author_display_name: textOrNull,
    // Upstream has always supplied a description; a missing one is a source failure, not unknown.
    description: z.string().trim().min(1),
    hf_slug: textOrNull,
    knowledge_cutoff: textOrNull,
    reasoning_config: z
      .object({
        default_reasoning_effort: textOrNull,
        is_mandatory_reasoning: flagOrNull,
        supported_reasoning_efforts: stringsOrNull,
      })
      .nullable()
      .catch(null),
    supports_reasoning: flagOrNull,
  }),
)

/** Listed endpoints serving a model, by provider. */
export interface ModelListing {
  endpoints: number
  providerIds: ReadonlySet<string>
}

/** Catalog row to V5 contract, with its current listing summary. */
export function toModel(row: CurrentModelRow, listing: ModelListing | undefined): Model {
  const facts = Metadata.parse(row.metadata_json)
  const [author = row.model_id] = row.model_id.split('/')

  return Model.parse({
    author: { id: author, name: facts.author_display_name },
    created_at: isoDate.parse(row.or_created_at),
    description: facts.description,
    hf_slug: facts.hf_slug,
    id: row.model_id,
    input_modalities: row.input_modalities,
    knowledge_cutoff: facts.knowledge_cutoff,
    listed_endpoints: listing?.endpoints ?? 0,
    name: row.display_name,
    output_modalities: row.output_modalities,
    permaslug: row.permaslug,
    provider_ids: [...(listing?.providerIds ?? [])].toSorted(),
    reasoning_config: {
      default_reasoning_effort: facts.reasoning_config?.default_reasoning_effort ?? null,
      is_mandatory_reasoning: facts.reasoning_config?.is_mandatory_reasoning ?? null,
      supported_reasoning_efforts: facts.reasoning_config?.supported_reasoning_efforts ?? null,
    },
    supports_reasoning: facts.supports_reasoning,
    variant: row.variant,
  })
}

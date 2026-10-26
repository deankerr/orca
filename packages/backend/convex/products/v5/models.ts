import { Model } from '@orca/contract/model'
import { z } from 'zod'

import type { CurrentModelRow } from '../../catalog/tables/current'
import type { EventRow } from '../../catalog/tables/events'
import { flagOrNull, isoDate, stringsOrNull, textOrNull } from '../../fields'
import { JsonObjectFromString } from '../../json'
import type { JsonValue } from '../../json'
import { field, project, translateStored } from './projection'
import type { Fields } from './projection'

const text = z.string()
const strings = z.array(z.string())
const author = text.transform((id) => id.replace(/\/.*$/su, ''))

const fact = <Value extends JsonValue>(
  path: string[],
  schema: z.ZodType<Value>,
  options?: { set?: true },
) => field(['metadata', ...path], schema, options)

/** Model Contract fields read from the catalog entity; listing fields are added by `toModel`. */
export const modelFields = {
  // The author is the model ID prefix.
  'author.id': field(['model_id'], author),
  'author.name': fact(['author_display_name'], textOrNull),
  created_at: field(['or_created_at'], isoDate),
  // Upstream has always supplied a description; a missing one is a source failure, not unknown.
  description: fact(['description'], z.string().trim().min(1)),
  hf_slug: fact(['hf_slug'], textOrNull),
  id: field(['model_id'], text),
  input_modalities: field(['input_modalities'], strings, { set: true }),
  knowledge_cutoff: fact(['knowledge_cutoff'], textOrNull),
  name: field(['display_name'], text),
  output_modalities: field(['output_modalities'], strings, { set: true }),
  permaslug: field(['permaslug'], text),
  'reasoning_config.default_reasoning_effort': fact(
    ['reasoning_config', 'default_reasoning_effort'],
    textOrNull,
  ),
  'reasoning_config.is_mandatory_reasoning': fact(
    ['reasoning_config', 'is_mandatory_reasoning'],
    flagOrNull,
  ),
  // Stored diffs match string arrays by value, so a reordering alone is not an Event.
  'reasoning_config.supported_reasoning_efforts': fact(
    ['reasoning_config', 'supported_reasoning_efforts'],
    stringsOrNull,
    { set: true },
  ),
  supports_reasoning: fact(['supports_reasoning'], flagOrNull),
  variant: field(['variant'], text),
} satisfies Fields

/** Listed endpoints serving a model, by provider. */
export interface ModelListing {
  endpoints: number
  providerIds: ReadonlySet<string>
}

/** Catalog row to V5 contract, with its current listing summary. */
export function toModel(row: CurrentModelRow, listing: ModelListing | undefined): Model {
  const metadata = JsonObjectFromString.parse(row.metadata_json)

  return Model.parse({
    ...project(modelFields, { ...row, metadata }),
    listed_endpoints: listing?.endpoints ?? 0,
    provider_ids: [...(listing?.providerIds ?? [])].toSorted(),
  })
}

/** Stored model UPDATE to Contract field changes. */
export function translateModelUpdate(row: Extract<EventRow, { entity_kind: 'model' }>) {
  return translateStored(modelFields, row.change_json)
}

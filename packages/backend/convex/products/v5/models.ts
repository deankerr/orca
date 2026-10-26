import { Model } from '@orca/contract/model'
import { z } from 'zod'

import type { CurrentModelRow } from '../../catalog/tables/current'
import type { EventRow } from '../../catalog/tables/events'
import { flagOrNull, isoDate, stringsOrNull, textOrNull } from '../../fields'
import { JsonObjectFromString } from '../../json'
import { field, project, translateStored } from './projection'
import type { Fields, Kind, KindValues } from './projection'

const text = z.string()
const strings = z.array(z.string())
const author = text.transform((id) => id.replace(/\/.*$/su, ''))

const fact = <K extends Kind>(kind: K, path: string[], schema: z.ZodType<KindValues[K]>) =>
  field(kind, ['metadata', ...path], schema)

/** Model Contract fields read from the catalog entity; listing fields are added by `toModel`. */
export const modelFields = {
  // The author is the model ID prefix.
  'author.id': field('text', ['model_id'], author),
  'author.name': fact('text', ['author_display_name'], textOrNull),
  created_at: field('text', ['or_created_at'], isoDate),
  // Upstream has always supplied a description; a missing one is a source failure, not unknown.
  description: fact('prose', ['description'], z.string().trim().min(1)),
  hf_slug: fact('text', ['hf_slug'], textOrNull),
  id: field('text', ['model_id'], text),
  input_modalities: field('list', ['input_modalities'], strings),
  knowledge_cutoff: fact('text', ['knowledge_cutoff'], textOrNull),
  name: field('text', ['display_name'], text),
  output_modalities: field('list', ['output_modalities'], strings),
  permaslug: field('text', ['permaslug'], text),
  'reasoning_config.default_reasoning_effort': fact(
    'text',
    ['reasoning_config', 'default_reasoning_effort'],
    textOrNull,
  ),
  'reasoning_config.is_mandatory_reasoning': fact(
    'flag',
    ['reasoning_config', 'is_mandatory_reasoning'],
    flagOrNull,
  ),
  // Stored diffs match string arrays by value, so a reordering alone is not an Event.
  'reasoning_config.supported_reasoning_efforts': fact(
    'list',
    ['reasoning_config', 'supported_reasoning_efforts'],
    stringsOrNull,
  ),
  supports_reasoning: fact('flag', ['supports_reasoning'], flagOrNull),
  variant: field('text', ['variant'], text),
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

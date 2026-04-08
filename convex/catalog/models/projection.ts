import { omit } from 'remeda'

import type { Doc } from '../../_generated/dataModel'

export function createModelProjection(doc: Doc<'or_views_models'>) {
  return omit(doc, ['icon_url', 'tokenizer', 'instruct_type'])
}

export type ModelProjection = ReturnType<typeof createModelProjection>

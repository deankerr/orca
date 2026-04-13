import { omit } from 'remeda'

import type { Doc } from '../../_generated/dataModel'

type ModelProjectionOptions = {
  description?: string
}

export function createModelProjection(
  doc: Doc<'or_views_models'>,
  options?: ModelProjectionOptions,
) {
  const description = options?.description === undefined ? {} : { description: options.description }

  return {
    ...omit(doc, ['icon_url', 'tokenizer', 'instruct_type']),
    ...description,
  }
}

export type ModelProjection = ReturnType<typeof createModelProjection>

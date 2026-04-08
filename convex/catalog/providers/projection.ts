import { omit } from 'remeda'

import type { Doc } from '../../_generated/dataModel'

export function createProviderProjection(doc: Doc<'or_views_providers'>) {
  return omit(doc, ['icon_url'])
}

export type ProviderProjection = ReturnType<typeof createProviderProjection>

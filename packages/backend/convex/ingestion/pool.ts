import { Workpool } from '@convex-dev/workpool'

import { components } from '#generated/api'

export const pool = new Workpool(components.ingestionPool, {
  maxParallelism: 4,
  retryActionsByDefault: true,
})

import { Workpool } from '@convex-dev/workpool'

import { components } from './_generated/api'

export const pool = new Workpool(components.workpool, {
  maxParallelism: 5,
  retryActionsByDefault: false,
})

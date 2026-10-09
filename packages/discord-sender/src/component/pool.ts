import { Workpool } from '@convex-dev/workpool'

import { components } from './_generated/api'

export const pool = new Workpool(components.workpool, {
  // Raising this is a design change, not a throughput tuning knob. There are no
  // per-job claims: an action owns its in-memory job list until it returns.
  maxParallelism: 1,
  // Execution failures resume from committed results. Discord REST owns HTTP
  // retries and waits inside the action; Workpool retries exhausted SDK errors.
  // An HTTP success lost before its checkpoint may be sent again.
  retryActionsByDefault: true,
})

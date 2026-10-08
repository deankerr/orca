import { Workpool } from '@convex-dev/workpool'

import { components } from './_generated/api'

export const pool = new Workpool(components.workpool, {
  // Raising this is a design change, not a throughput tuning knob. There are no
  // per-job claims: an action owns its in-memory job list until it returns.
  maxParallelism: 1,
  // Execution failures resume from committed results. HTTP retries are ordinary
  // decisions inside a successful action, with response-specific wake times.
  // An HTTP success lost before its checkpoint may be sent again.
  retryActionsByDefault: true,
})

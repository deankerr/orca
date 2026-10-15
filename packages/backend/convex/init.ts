import { v } from 'convex/values'

import { internalMutation } from '#generated/server'

const init = internalMutation({
  args: {},
  returns: v.null(),
  handler: () =>
    // TODO: Bootstrap preview data with the new ingestion orchestrator.
    null,
})

export default init

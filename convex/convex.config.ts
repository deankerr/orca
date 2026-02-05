import { defineApp } from 'convex/server'

import aggregate from '@convex-dev/aggregate/convex.config'
import workflow from '@convex-dev/workflow/convex.config'

const app = defineApp()
app.use(aggregate, { name: 'aggregateModelStatsByTime' })
app.use(workflow)

export default app

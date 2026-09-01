import { WorkflowManager } from '@convex-dev/workflow'

import { components } from '../../_generated/api'

/** Durable execution for meps2 observe and drain. */
export const workflow = new WorkflowManager(components.workflow)

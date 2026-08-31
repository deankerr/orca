import { WorkflowManager } from '@convex-dev/workflow'

import { components } from '../../_generated/api'

/** Durable execution for meps2. Domain modules do not import this. */
export const workflow = new WorkflowManager(components.workflow)

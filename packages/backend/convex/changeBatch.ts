// Change batch — queries all changes for a crawl_id.
//
// Returns a flat list of EntityChange[], one per entity per lifecycle state.
// Consumers handle any nesting or grouping they need for display.

import { internalQuery } from './_generated/server'
import { changes } from './changes'

export const byCrawlId = internalQuery(changes.get)

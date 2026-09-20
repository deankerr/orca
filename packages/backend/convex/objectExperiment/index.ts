import { createObjectStore } from '@orca/objects'
import type { ObjectStore } from '@orca/objects'

import { internal } from '../_generated/api'
import type { DataModel } from '../_generated/dataModel'

export const objects: ObjectStore<DataModel> = createObjectStore({
  catalog: {
    lookup: internal.objectExperiment.database.find,
    insert: internal.objectExperiment.database.commit,
    remove: internal.objectExperiment.database.erase,
  },
})

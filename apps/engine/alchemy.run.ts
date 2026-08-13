import * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Effect from 'effect/Effect'

import { CaptureQueue } from './src/resources/CaptureQueue.ts'
import { EntitiesDB } from './src/resources/EntitiesDB.ts'
import { ObservationsBucket } from './src/resources/ObservationsBucket.ts'
import { PublicApiV2DB } from './src/resources/PublicApiV2DB.ts'
import { SinksQueue } from './src/resources/SinksQueue.ts'
import Engine from './src/worker.ts'

// * Engine stack: Worker, ObservationsBucket, queues, EntitiesDB, PublicApiV2DB.
export default Alchemy.Stack(
  'OrcaEngine',
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* stack() {
    const observationsBucket = yield* ObservationsBucket
    const captureQueue = yield* CaptureQueue
    const sinksQueue = yield* SinksQueue
    const entitiesDb = yield* EntitiesDB
    const publicApiV2Db = yield* PublicApiV2DB
    const engine = yield* Engine

    return {
      bucketName: observationsBucket.bucketName,
      captureQueueName: captureQueue.queueName,
      databaseName: entitiesDb.databaseName,
      publicApiV2DatabaseName: publicApiV2Db.databaseName,
      sinksQueueName: sinksQueue.queueName,
      url: engine.url,
    }
  }),
)

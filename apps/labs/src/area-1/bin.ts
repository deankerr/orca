import * as BunRuntime from '@effect/platform-bun/BunRuntime'
import * as BunServices from '@effect/platform-bun/BunServices'
import * as Effect from 'effect/Effect'
import * as Command from 'effect/unstable/cli/Command'

import { cli } from './cli.ts'

BunRuntime.runMain(Command.run(cli, { version: '0.1.0' }).pipe(Effect.provide(BunServices.layer)))

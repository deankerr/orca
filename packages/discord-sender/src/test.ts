/// <reference types="vite/client" />
import * as workpool from '@convex-dev/workpool/test'
import type { TestConvex } from 'convex-test'
import type { GenericSchema, SchemaDefinition } from 'convex/server'

import schema from './component/schema'

const modules = import.meta.glob(['./component/**/*.ts', '!./component/**/*.{test,d}.ts'])

function register(t: TestConvex<SchemaDefinition<GenericSchema, boolean>>, name = 'discordSender') {
  t.registerComponent(name, schema, modules)
  workpool.register(t, `${name}/workpool`)
}

export default { modules, register, schema }

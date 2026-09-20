import { v } from 'convex/values'

import { internal } from '../_generated/api'
import { internalAction, internalMutation, internalQuery } from '../_generated/server'
import { catalog } from './definition'
import { objects } from './index'

export const rollback = internalMutation({
  args: catalog.definitions.remove.args,
  returns: v.null(),
  handler: async (ctx, args) => {
    await catalog.remove(ctx, args)
    throw new Error('demo rollback requested')
  },
})

export const fileExists = internalQuery({
  args: { storageId: v.id('_storage') },
  returns: v.boolean(),
  handler: async (ctx, { storageId }) => (await ctx.db.system.get(storageId)) !== null,
})

function check(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Demo failed: ${message}`)
  }
}

async function expectFailure(operation: Promise<unknown>, message: string) {
  try {
    await operation
  } catch (error) {
    check(String(error).includes(message), `unexpected error: ${String(error)}`)
    return
  }
  throw new Error(`Demo failed: expected ${message}`)
}

/** Run with `convex run objectExperiment/demo:run '{}'`. Uses and removes unique dummy files. */
export const run = internalAction({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx): Promise<string[]> => {
    const path = `package-demo/${crypto.randomUUID()}`
    const identity = { path, name: 'unicode.txt' }
    const empty = { path, name: 'empty.txt' }
    const checks: string[] = []
    try {
      check((await objects.load(ctx, identity)) === null, 'missing object should be null')
      checks.push('missing object returns null')

      const text = 'Dummy file: hello 🌊\nSecond line\n'
      await objects.store(ctx, { ...identity, text })
      check((await objects.load(ctx, identity)) === text, 'UTF-8 round trip')
      await objects.store(ctx, { ...empty, text: '' })
      check((await objects.load(ctx, empty)) === '', 'empty file round trip')
      checks.push('Unicode and empty files round-trip through deployed functions')

      const entry = await ctx.runQuery(internal.objectExperiment.database.find, identity)
      check(entry !== null, 'catalog entry exists')
      check(
        await ctx.runQuery(internal.objectExperiment.demo.fileExists, {
          storageId: entry.storageId,
        }),
        'file exists',
      )
      await expectFailure(
        objects.store(ctx, { ...identity, text: 'replacement' }),
        'Object already exists',
      )
      check((await objects.load(ctx, identity)) === text, 'duplicate preserved original')
      checks.push('duplicate rejected and original preserved')

      await expectFailure(
        ctx.runMutation(internal.objectExperiment.demo.rollback, identity),
        'demo rollback requested',
      )
      check(
        (await objects.load(ctx, identity)) === text,
        'caller rollback restored catalog and file',
      )
      checks.push('direct helper shares caller transaction: file and catalog deletion rolled back')

      check(await objects.remove(ctx, identity), 'first deletion succeeds')
      check(!(await objects.remove(ctx, identity)), 'second deletion is a no-op')
      check((await objects.load(ctx, identity)) === null, 'catalog entry removed')
      check(
        !(await ctx.runQuery(internal.objectExperiment.demo.fileExists, {
          storageId: entry.storageId,
        })),
        'file removed',
      )
      checks.push('deletion removes catalog entry and actual file; retry is a no-op')
      return checks
    } finally {
      await objects.remove(ctx, identity)
      await objects.remove(ctx, empty)
    }
  },
})

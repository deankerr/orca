import { afterAll, beforeAll, expect, test } from 'bun:test'
import assert from 'node:assert/strict'

import { convexTest } from 'convex-test'
import { anyApi } from 'convex/server'
import type { ApiFromModules, FilterApi, FunctionReference } from 'convex/server'

import { createObjectStore } from '../index'
import { catalog, counter, otherCatalog, schema } from './consumer'
import type * as consumer from './consumer'

let originalGlobals: PropertyDescriptorMap
beforeAll(() => {
  originalGlobals = Object.getOwnPropertyDescriptors(globalThis)
})
afterAll(() => {
  // convex-test leaves async-local accessor proxies installed after its last call.
  // Restore their original descriptors so other Bun suites can spy on globals.
  for (const [name, descriptor] of Object.entries(originalGlobals)) {
    const current = Object.getOwnPropertyDescriptor(globalThis, name)
    if (current?.get !== descriptor.get || current?.set !== descriptor.set) {
      Object.defineProperty(globalThis, name, descriptor)
    }
  }
})

// Reproduce generated API typing without relying on ORCA or a deployed backend.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Same anyApi proxy and module-derived type used by Convex codegen.
const internal = anyApi as unknown as FilterApi<
  ApiFromModules<{ arbitrary: typeof consumer }>,
  FunctionReference<'query' | 'mutation', 'internal'>
>
const objects = createObjectStore<consumer.DataModel>({
  catalog: {
    insert: internal.arbitrary.commit,
    lookup: internal.arbitrary.find,
    remove: internal.arbitrary.erase,
  },
})
const otherObjects = createObjectStore<consumer.DataModel>({
  catalog: {
    insert: internal.arbitrary.otherCommit,
    lookup: internal.arbitrary.otherFind,
    remove: internal.arbitrary.otherErase,
  },
})
const modules = {
  './_generated/server.ts': async () => ({}),
  './arbitrary.ts': async () => await import('./consumer'),
}

test('plain operations and definitions share a handler; another module can use db.patch', async () => {
  expect(catalog.lookup).toBe(catalog.definitions.lookup.handler)
  expect(counter.increment).toBe(counter.definitions.increment.handler)
  const t = convexTest(schema, modules)
  expect(await t.run(async (ctx) => await counter.increment(ctx, { key: 'demo' }))).toBe(1)
  expect(await t.mutation(internal.arbitrary.incrementCounter, { key: 'demo' })).toBe(2)
})

test('consumer-named table and functions support action storage, duplicate cleanup, and removal', async () => {
  const t = convexTest(schema, modules)
  const identity = { name: 'one', path: 'test' }
  expect(await t.action(async (ctx) => await objects.load(ctx, identity))).toBeNull()
  await t.action(async (ctx) => {
    await objects.store(ctx, { ...identity, text: 'hello 🌊' })
  })
  expect(await t.action(async (ctx) => await objects.load(ctx, identity))).toBe('hello 🌊')

  await assert.rejects(
    t.action(async (ctx) => {
      await objects.store(ctx, { ...identity, text: 'duplicate' })
    }),
    /Object already exists/,
  )
  expect(await t.action(async (ctx) => await objects.load(ctx, identity))).toBe('hello 🌊')
  expect(await t.run(async (ctx) => await ctx.db.system.query('_storage').collect())).toHaveLength(
    1,
  )

  await t.run(async (ctx) => {
    expect(await catalog.lookup(ctx, identity)).not.toBeNull()
    expect(await otherCatalog.lookup(ctx, identity)).toBeNull()
  })
  await t.action(async (ctx) => {
    await otherObjects.store(ctx, { ...identity, text: 'independent' })
  })
  expect(await t.action(async (ctx) => await otherObjects.load(ctx, identity))).toBe('independent')

  await assert.rejects(t.mutation(internal.arbitrary.rollback, identity), /abort caller/)
  expect(await t.action(async (ctx) => await objects.load(ctx, identity))).toBe('hello 🌊')
  expect(await t.run(async (ctx) => await ctx.db.query('unrelated').collect())).toHaveLength(0)

  expect(await t.action(async (ctx) => await objects.remove(ctx, identity))).toBe(true)
  expect(await t.action(async (ctx) => await objects.remove(ctx, identity))).toBe(false)
  expect(await t.action(async (ctx) => await objects.load(ctx, identity))).toBeNull()
  expect(await t.run(async (ctx) => await ctx.db.system.query('_storage').collect())).toHaveLength(
    1,
  )
  expect(await t.run(async (ctx) => await otherCatalog.lookup(ctx, identity))).not.toBeNull()
  expect(await t.action(async (ctx) => await otherObjects.remove(ctx, identity))).toBe(true)
  expect(await t.run(async (ctx) => await ctx.db.system.query('_storage').collect())).toHaveLength(
    0,
  )
})

test('concurrent stores have one winner and remove the rejected upload', async () => {
  const t = convexTest(schema, modules)
  const identity = { name: 'race', path: 'test' }
  const outcomes = await Promise.allSettled(
    ['first', 'second'].map(async (text) => {
      await t.action(async (ctx) => {
        await objects.store(ctx, { ...identity, text })
      })
    }),
  )
  expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  expect(outcomes.filter((result) => result.status === 'rejected')).toHaveLength(1)
  const winner = outcomes[0]?.status === 'fulfilled' ? 'first' : 'second'
  expect(await t.action(async (ctx) => await objects.load(ctx, identity))).toBe(winner)
  expect(await t.run(async (ctx) => await ctx.db.system.query('_storage').collect())).toHaveLength(
    1,
  )
})

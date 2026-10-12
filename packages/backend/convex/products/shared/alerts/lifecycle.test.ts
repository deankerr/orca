import { expect, test } from 'bun:test'
import path from 'node:path'

import { convexTest } from 'convex-test'
import type { PaginationResult } from 'convex/server'

import { api } from '#generated/api'

import schema from '../../../schema'
import type { EntityAlert } from './curate'

const root = path.resolve(import.meta.dir, '../../..')
const modules = Object.fromEntries(
  [...new Bun.Glob('**/*.{ts,js}').scanSync({ absolute: true, cwd: root })]
    .filter((file) => !file.endsWith('.test.ts') && !file.endsWith('.d.ts'))
    .map((file) => [file, async (): Promise<unknown> => await import(file)]),
)
const times = [0, 1, 2, 3, 4].map((hour) => `2026-10-10T0${hour}:00:00.000Z`)
const at = (hour: number) => times[hour] ?? ''

test('observation-only lifecycles preserve baseline knowledge, serving transitions, and historical context across pages', async () => {
  const t = convexTest({ schema, modules })
  await t.run(async (ctx) => {
    for (const [hour, scan_at] of times.entries()) {
      await ctx.db.insert('scan_ingestions', {
        from_scan_at: hour === 0 ? null : at(hour - 1),
        scan_at,
        progress:
          hour === 4
            ? { kind: 'pending', completed: ['events', 'observations'] }
            : { kind: 'complete' },
      })
      // The model remains detected even when all endpoints disappear.
      await ctx.db.insert('catalog_observations', {
        entity_kind: 'model',
        entity_id: 'known',
        scan_at,
        detected: true,
        endpoint_count: hour % 2,
      })
      await ctx.db.insert('catalog_observations', {
        entity_kind: 'provider',
        entity_id: 'provider',
        scan_at,
        endpoint_count: hour % 2,
      })
    }
    await ctx.db.insert('catalog_events', {
      entity_kind: 'model',
      entity_id: 'known',
      scan_at: at(1),
      type: 'UPDATE',
      context: { model: { model_id: 'known', display_name: 'Historical name' } },
      change_json: JSON.stringify({
        changes: [
          { key: 'display_name', type: 'UPDATE', value: 'Historical name', oldValue: 'Old name' },
        ],
      }),
    })
    await ctx.db.insert('catalog_events', {
      entity_kind: 'model',
      entity_id: 'known',
      scan_at: at(4),
      type: 'UPDATE',
      context: { model: { model_id: 'known', display_name: 'Future name' } },
      change_json: JSON.stringify({
        changes: [
          {
            key: 'display_name',
            type: 'UPDATE',
            value: 'Future name',
            oldValue: 'Historical name',
          },
        ],
      }),
    })
    await ctx.db.insert('catalog_observations', {
      entity_kind: 'model',
      entity_id: 'new',
      scan_at: at(1),
      detected: true,
      endpoint_count: 1,
    })
    // Endpoint observations do not duplicate endpoint Events in the combined stream.
    await ctx.db.insert('catalog_observations', {
      entity_kind: 'endpoint',
      entity_id: 'endpoint',
      scan_at: at(1),
      detected: true,
      model_id: 'new',
      provider_id: 'provider',
      provider_tag: 'provider',
    })
  })

  let cursor: string | null = null
  const alerts: EntityAlert[] = []
  let emptyPages = 0
  for (let count = 0; count < 30; count += 1) {
    const page: PaginationResult<EntityAlert> = await t.query(api.products.monitor.query.feed, {
      scope: { kind: 'all' },
      paginationOpts: { numItems: 1, cursor },
    })
    alerts.push(...page.page)
    if (page.page.length === 0) {
      emptyPages += 1
    }
    if (page.isDone) {
      break
    }
    expect(page.continueCursor).not.toBe(cursor)
    cursor = page.continueCursor
    expect(count).toBeLessThan(29)
  }
  expect(emptyPages).toBeGreaterThan(0)
  expect(alerts.filter((alert) => alert.entity_id === 'known')).toMatchObject([
    {
      type: 'model_added',
      observed_at: at(3),
      previously_known: true,
      after: {},
      context: { model: { display_name: 'Historical name' } },
    },
    { type: 'model_removed', observed_at: at(2), before: {} },
    { type: 'model_added', observed_at: at(1), previously_known: true, after: {} },
  ])
  expect(alerts.find((alert) => alert.entity_id === 'new')).toMatchObject({
    previously_known: false,
  })
  expect(alerts.every((alert) => alert.observed_at > at(0) && alert.observed_at < at(4))).toBe(true)
  expect(
    new Set(alerts.map((alert) => `${alert.observed_at}/${alert.entity_kind}/${alert.entity_id}`))
      .size,
  ).toBe(alerts.length)
  expect(JSON.stringify(alerts)).not.toContain('Future name')

  const model = await t.query(api.products.feed.query.byModel, {
    model_id: 'known',
    paginationOpts: { numItems: 100, cursor: null },
  })
  expect(model.page.map(({ type }) => type)).toEqual([
    'model_added',
    'model_removed',
    'model_added',
  ])
  const provider = await t.query(api.products.feed.query.byProvider, {
    provider_id: 'provider',
    paginationOpts: { numItems: 100, cursor: null },
  })
  expect(provider.page.map(({ type }) => type)).toEqual([
    'provider_added',
    'provider_removed',
    'provider_added',
  ])
})

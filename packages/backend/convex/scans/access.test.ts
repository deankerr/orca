import { rejects } from 'node:assert/strict'

/* oxlint-disable typescript/no-unsafe-type-assertion -- Tests replace Objects operations; no other action context is used. */
import { expect, vi, test } from 'vitest'

import type { ActionCtx } from '#generated/server'
import * as objects from '#objects'

import * as scans from './access'
import { store } from './access'

test('scan storage round-trips collected entries and loads one extracted scan', async () => {
  const ctx = {} as ActionCtx
  const scan_at = '2026-10-02T10:40:04.272Z'

  const entry = {
    endpoints: null,
    model: {
      input_modalities: ['text'],
      output_modalities: ['image'],
      permaslug: 'author/model-v1',
      slug: 'author/model',
    },
    model_id: 'author/model',
    variant: 'standard',
  }

  const scan = { entries: [entry], scan_at }
  const saved = vi.spyOn(objects, 'store').mockResolvedValue()
  const batch = vi.spyOn(objects, 'loadMany').mockResolvedValue([])

  try {
    await store(ctx, scan)

    const text = `${JSON.stringify({ ...entry, scan_at })}\n`

    expect(saved).toHaveBeenCalledWith(ctx, {
      name: `scan.${scan_at}.jsonl`,
      path: 'scans',
      text,
    })

    batch.mockResolvedValue([text])
    expect(await scans.loadCollected(ctx, scan_at)).toEqual(scan)

    expect(await scans.load(ctx, scan_at)).toEqual({
      endpoints: new Map(),
      models: new Map(),
      providers: new Map(),
      scan_at,
      stats: [],
    })
    batch.mockResolvedValue([null])
    await rejects(scans.load(ctx, scan_at), /Scan not found/u)
    await rejects(store(ctx, { ...scan, entries: [] }))
    expect(saved).toHaveBeenCalledTimes(1)
  } finally {
    saved.mockRestore()
    batch.mockRestore()
  }
})

test('navigation selects scans independently of loading and extraction', async () => {
  const ctx = {} as ActionCtx
  const times = ['2026-10-01T00:00:00.000Z', '2026-10-02T00:00:00.000Z', '2026-10-03T00:00:00.000Z']

  const entry = (id: string, output = 'text') => ({
    endpoints: [
      {
        id: `${id}-endpoint`,
        model_variant_slug: id,
        provider_info: { displayName: 'Provider', name: 'Provider', slug: 'provider' },
        provider_slug: 'provider/region',
        status: 'online',
        variant: 'free',
      },
    ],
    model: {
      created_at: times[0],
      input_modalities: ['text'],
      output_modalities: [output],
      permaslug: `${id}-v1`,
      short_name: id,
      slug: id,
    },
    model_id: id,
    variant: 'free',
  })

  const stored = new Map(
    times.map((scan_at, index) => [
      `scan.${scan_at}.jsonl`,
      [
        entry(`author/text-${index}:free`),
        entry('author/image', 'image'),
        entry('google/lyria-3-clip-preview'),
        { ...entry('author/unlisted'), endpoints: null },
        { ...entry('author/unserved'), endpoints: [] },
      ]
        .map((value) => JSON.stringify({ ...value, scan_at }))
        .join('\n'),
    ]),
  )

  const discovery = vi.spyOn(objects, 'namesAtOrAfter').mockImplementation(async (_, args) => {
    const selected = [...stored.keys()].filter(
      (name) => name >= args.atOrAfter && (args.before === undefined || name < args.before),
    )

    return (args.order === 'desc' ? selected.toReversed() : selected).slice(0, args.limit)
  })

  const batch = vi
    .spyOn(objects, 'loadMany')
    .mockImplementation(async (_, identities) =>
      identities.map(({ name }) => stored.get(name) ?? null),
    )

  try {
    const [first, second, third] = times
    const between = '2026-10-01T12:00:00.000Z'
    expect(await scans.times(ctx, { limit: 2, order: 'asc' })).toEqual([first, second])
    expect(await scans.times(ctx, { atOrAfter: between, limit: 5, order: 'asc' })).toEqual([
      second,
      third,
    ])
    expect(await scans.times(ctx, { before: third, limit: 5, order: 'desc' })).toEqual([
      second,
      first,
    ])
    expect(
      await scans.times(ctx, { atOrAfter: between, before: third, limit: 5, order: 'asc' }),
    ).toEqual([second])
    expect(batch).not.toHaveBeenCalled()

    for (const [index, time] of times.entries()) {
      const scan = await scans.load(ctx, time)
      const id = `author/text-${index}:free`

      expect(scan).toBeDefined()
      // Models are discovered only through endpoints.
      expect([...(scan?.models.keys() ?? [])]).toEqual([id])
      expect(scan?.models.get(id)).toEqual({ ...entry(id).model, id, variant: 'free' })

      expect([...(scan?.providers.values() ?? [])]).toEqual([
        { displayName: 'Provider', name: 'Provider', provider_id: 'provider' },
      ])

      expect([...(scan?.endpoints.values() ?? [])]).toMatchObject([
        {
          id: `${id}-endpoint`,
          model_id: id,
          model_variant_slug: id,
          provider_id: 'provider',
          provider_tag: 'provider/region',
          variant: 'free',
        },
      ])

      expect(scan).not.toHaveProperty('entries')
    }
  } finally {
    discovery.mockRestore()
    batch.mockRestore()
  }
})

test('discovery finds the newest capture in one read and handles exhausted navigation', async () => {
  const ctx = {} as ActionCtx

  const times = Array.from({ length: 205 }, (_, index) =>
    new Date(Date.UTC(2026, 0, 1, index)).toISOString(),
  )

  const names = times.map((at) => `scan.${at}.jsonl`)

  const discovery = vi.spyOn(objects, 'namesAtOrAfter').mockImplementation(async (_, args) => {
    expect(args.path).toBe('scans')

    const selected = names.filter(
      (name) => name >= args.atOrAfter && (args.before === undefined || name < args.before),
    )

    return (args.order === 'desc' ? selected.toReversed() : selected).slice(0, args.limit)
  })

  try {
    expect(await scans.latest(ctx)).toBe(times.at(-1) ?? null)
    expect(discovery).toHaveBeenCalledTimes(1)

    expect(discovery).toHaveBeenLastCalledWith(ctx, {
      atOrAfter: '',
      limit: 1,
      order: 'desc',
      path: 'scans',
    })

    discovery.mockClear()
    expect(await scans.latest(ctx, { atOrAfter: times.at(-1) })).toBe(times.at(-1) ?? null)
    expect(discovery).toHaveBeenCalledTimes(1)
    expect(await scans.latest(ctx, { atOrAfter: times[200] })).toBe(times.at(-1) ?? null)
    expect(await scans.times(ctx, { before: times[0], limit: 1, order: 'desc' })).toEqual([])

    discovery.mockResolvedValue([])
    expect(await scans.latest(ctx)).toBeNull()
    expect(await scans.latest(ctx, { atOrAfter: times[204] })).toBeNull()
    expect(await scans.times(ctx, { limit: 1, order: 'asc' })).toEqual([])

    for (const name of ['bad-name', 'scan.bad-time.jsonl', 'scan.2026-02-30T00:00:00.000Z.jsonl']) {
      discovery.mockResolvedValue([name])
      await rejects(scans.latest(ctx))
      await rejects(scans.times(ctx, { limit: 1, order: 'asc' }))
    }
  } finally {
    discovery.mockRestore()
  }
})

test('collected reads normalize references once and reject invalid references before storage access', async () => {
  const ctx = {} as ActionCtx
  const time = '2026-10-03T00:00:00.000Z'
  const batch = vi.spyOn(objects, 'loadMany').mockResolvedValue([''])
  const discovery = vi.spyOn(objects, 'namesAtOrAfter').mockResolvedValue([])

  try {
    for (const reference of [
      time,
      `scan.${time}.jsonl`,
      '2026-10-03T00:00:00Z',
      '2026-10-03T10:00:00+10:00',
    ]) {
      expect(await scans.loadCollected(ctx, reference)).toEqual({ entries: [], scan_at: time })
      expect(batch).toHaveBeenLastCalledWith(ctx, [{ name: `scan.${time}.jsonl`, path: 'scans' }])
    }

    expect(discovery).not.toHaveBeenCalled()
    batch.mockClear()

    for (const invalid of [
      '',
      '2026-10-03',
      '2026-02-30T00:00:00.000Z',
      'scan.bad-time.jsonl',
      'scan.invalid',
    ]) {
      await rejects(scans.loadCollected(ctx, invalid))
    }

    expect(batch).not.toHaveBeenCalled()
    expect(discovery).not.toHaveBeenCalled()
  } finally {
    batch.mockRestore()
    discovery.mockRestore()
  }
})

/// <reference types="bun" />

/* oxlint-disable typescript/no-unsafe-type-assertion -- Tests replace Objects operations; no other action context is used. */
import { expect, spyOn, test } from 'bun:test'
import { rejects } from 'node:assert/strict'

import type { ActionCtx } from '../_generated/server'
import * as objects from '../objects'
import { latest, loadRaw, loadPair, loadNextPair, store } from './index'
import { scanTime } from './time'

test('scan storage round-trips the existing JSONL format and rejects inconsistent contents', async () => {
  const ctx = {} as ActionCtx
  const scan_at = '2026-10-02T10:40:04.272Z'
  const entry = {
    model_id: 'author/model',
    variant: 'standard',
    model: {
      slug: 'author/model',
      permaslug: 'author/model-v1',
      input_modalities: ['text'],
      output_modalities: ['image'],
    },
    endpoints: null,
  }
  const scan = { scan_at, entries: [entry] }
  const saved = spyOn(objects, 'store').mockResolvedValue()
  const source = spyOn(objects, 'load').mockResolvedValue(null)
  const batch = spyOn(objects, 'loadMany').mockResolvedValue([])

  try {
    Object.defineProperty(entry, 'scan_at', { value: 'wrong' })
    await store(ctx, scan)

    const text = `${JSON.stringify({ ...entry, scan_at })}\n`
    expect(saved).toHaveBeenCalledWith(ctx, {
      path: 'scans',
      name: `scan.${scan_at}.jsonl`,
      text,
    })

    source.mockResolvedValue(text)
    expect(await loadRaw(ctx, scan_at)).toEqual(scan)

    const nextAt = '2026-10-02T11:40:04.272Z'
    batch.mockResolvedValue([text, text.replaceAll(scan_at, nextAt)])
    expect(await loadPair(ctx, { from_scan_at: scan_at, scan_at: nextAt })).toEqual({
      previous: { scan_at, models: new Map(), providers: new Map(), endpoints: new Map() },
      next: { scan_at: nextAt, models: new Map(), providers: new Map(), endpoints: new Map() },
    })
    expect(batch).toHaveBeenCalledWith(ctx, [
      { path: 'scans', name: `scan.${scan_at}.jsonl` },
      { path: 'scans', name: `scan.${nextAt}.jsonl` },
    ])

    await rejects(loadPair(ctx, { from_scan_at: scan_at, scan_at }), /must move forward/)
    await rejects(loadPair(ctx, { from_scan_at: nextAt, scan_at }), /must move forward/)

    for (const invalid of [
      null,
      '',
      'not json',
      '{}',
      JSON.stringify(entry),
      text.replaceAll(scan_at, 'wrong'),
      text.replaceAll(scan_at, nextAt),
      text + text.replaceAll(scan_at, nextAt),
    ]) {
      source.mockResolvedValue(invalid)
      await rejects(loadRaw(ctx, scan_at))
    }

    batch.mockResolvedValue([text, null])
    await rejects(loadPair(ctx, { from_scan_at: scan_at, scan_at: nextAt }), /Scan not found/)
    await rejects(store(ctx, { ...scan, entries: [] }))
    expect(saved).toHaveBeenCalledTimes(1)
  } finally {
    saved.mockRestore()
    source.mockRestore()
    batch.mockRestore()
  }
})

test('loading the next pair discovers scans, scopes text models and derives entity identities', async () => {
  const ctx = {} as ActionCtx
  const times = ['2026-10-01T00:00:00.000Z', '2026-10-02T00:00:00.000Z', '2026-10-03T00:00:00.000Z']
  const entry = (id: string, output = 'text') => ({
    model_id: id,
    variant: 'free',
    model: {
      slug: id,
      permaslug: `${id}-v1`,
      input_modalities: ['text'],
      output_modalities: [output],
    },
    endpoints: [
      {
        id: `${id}-endpoint`,
        model_variant_slug: id,
        variant: 'free',
        provider_slug: 'provider/region',
        provider_info: { slug: 'provider', name: 'Provider' },
        status: 'online',
      },
    ],
  })
  const stored = new Map(
    times.map((scan_at, index) => [
      `scan.${scan_at}.jsonl`,
      [
        entry(`author/text-${index}:free`),
        entry('author/image', 'image'),
        entry('google/lyria-3-clip-preview'),
        { ...entry('author/unlisted'), endpoints: null },
      ]
        .map((value) => JSON.stringify({ ...value, scan_at }))
        .join('\n'),
    ]),
  )
  const discovery = spyOn(objects, 'namesAtOrAfter').mockImplementation(async (_, args) =>
    [...stored.keys()].filter((name) => name >= args.atOrAfter).slice(0, args.limit),
  )
  const batch = spyOn(objects, 'loadMany').mockImplementation(async (_, identities) =>
    identities.map(({ name }) => stored.get(name) ?? null),
  )

  try {
    const first = await loadNextPair(ctx)
    const following = await loadNextPair(ctx, '2026-10-01T12:00:00.000Z')

    expect(first?.previous.scan_at).toBe(times[0])
    expect(first?.next.scan_at).toBe(times[1])
    expect(following?.previous).toEqual(first?.next)
    expect(following?.next.scan_at).toBe(times[2])

    for (const [index, scan] of [first?.previous, first?.next, following?.next].entries()) {
      const id = `author/text-${index}:free`

      expect(scan).toBeDefined()
      expect([...(scan?.models.keys() ?? [])]).toEqual([id, 'author/unlisted'])
      expect(scan?.models.get(id)).toEqual({ ...entry(id).model, id, variant: 'free' })
      expect([...(scan?.providers.values() ?? [])]).toEqual([
        { provider_id: 'provider', name: 'Provider' },
      ])
      expect([...(scan?.endpoints.values() ?? [])]).toEqual([
        {
          id: `${id}-endpoint`,
          model_variant_slug: id,
          variant: 'free',
          model_id: id,
          provider_id: 'provider',
          provider_tag: 'provider/region',
        },
      ])
      expect(scan).not.toHaveProperty('entries')
    }
  } finally {
    discovery.mockRestore()
    batch.mockRestore()
  }
})

test('discovery exposes canonical times across empty storage and multiple pages', async () => {
  const ctx = {} as ActionCtx
  const times = Array.from({ length: 205 }, (_, index) =>
    new Date(Date.UTC(2026, 0, 1, index)).toISOString(),
  )
  const names = times.map((at) => `scan.${at}.jsonl`)
  const discovery = spyOn(objects, 'namesAtOrAfter').mockImplementation(async (_, args) => {
    expect(args.path).toBe('scans')
    return names.filter((name) => name >= args.atOrAfter).slice(0, args.limit)
  })

  try {
    expect(await latest(ctx)).toBe(times.at(-1) ?? null)
    expect(discovery).toHaveBeenCalledTimes(3)
    discovery.mockClear()
    expect(await latest(ctx, times.at(-1))).toBe(times.at(-1) ?? null)
    expect(discovery).toHaveBeenCalledTimes(1)
    expect(await latest(ctx, times[200])).toBe(times.at(-1) ?? null)
    expect(await loadNextPair(ctx, times[204])).toBeNull()

    discovery.mockResolvedValue([])
    expect(await latest(ctx)).toBeNull()
    expect(await loadNextPair(ctx)).toBeNull()

    for (const name of ['bad-name', 'scan.bad-time.jsonl', 'scan.2026-02-30T00:00:00.000Z.jsonl']) {
      discovery.mockResolvedValue([name])
      await rejects(latest(ctx))
      await rejects(loadNextPair(ctx))
    }
  } finally {
    discovery.mockRestore()
  }
})

test('scan identity is canonical UTC', () => {
  const time = '2026-10-03T00:00:00.000Z'
  expect(scanTime.parse(time)).toBe(time)

  for (const invalid of [
    undefined,
    '',
    '2026-10-03',
    '2026-10-03T00:00:00Z',
    '2026-02-30T00:00:00.000Z',
    '2026-10-03T10:00:00.000+10:00',
  ]) {
    expect(scanTime.safeParse(invalid).success).toBe(false)
  }
})
